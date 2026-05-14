import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { endOfDay, startOfDay } from "../utils/calculateFinalBalance.js";

function normalizeContext(context) {
  if (!context) {
    return "";
  }

  if (typeof context === "string") {
    return context;
  }

  try {
    return JSON.stringify(context);
  } catch {
    return "[contexto nao serializavel]";
  }
}

function extractTemporalContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return { date: null, region: null };
  }

  const date = context.date ? new Date(context.date) : null;
  const safeDate = date && !Number.isNaN(date.getTime()) ? date : null;
  const region = typeof context.region === "string" ? context.region : null;

  return { date: safeDate, region };
}

function getMonthBounds(date) {
  const startsAt = startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
  const endsAt = endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  return { startsAt, endsAt };
}

function getWeekBounds(date) {
  const reference = startOfDay(date);
  const day = reference.getDay();
  const diff = (day + 6) % 7;
  const startsAt = new Date(reference);
  startsAt.setDate(reference.getDate() - diff);
  const endsAt = endOfDay(
    new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate() + 6),
  );
  return { startsAt, endsAt };
}

function formatDatePtBr(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${day}/${month}/${year}`;
}

function buildChatPrompt({ message, context, user, autoContext }) {
  const userContext = user
    ? `Usuario: ${user.name || ""} (${user.role || ""})`
    : "Usuario: anonimo";
  const contextText = normalizeContext(context);
  const temporal = extractTemporalContext(context);
  const dateText = temporal.date
    ? formatDatePtBr(temporal.date)
    : formatDatePtBr(new Date());
  const regionText = temporal.region || "Brasil";
  const autoContextText = normalizeContext(autoContext);

  return `Voce e um assistente inteligente para o sistema Hortifruit. Responda em pt-BR, com objetividade e foco em operacoes do negocio. Considere que estamos no Brasil e use as definicoes de estacoes do ano brasileiras. Seja especifico ao sugerir frutas, legumes e verduras para cultivo em cada estacao, citando exemplos claros quando a pergunta envolver sazonalidade.\n\nData de referencia: ${dateText}\nRegiao: ${regionText}\n${userContext}\nContexto adicional: ${contextText || "(vazio)"}\nDados internos (JSON): ${autoContextText || "(vazio)"}\n\nPergunta do usuario: ${message}`;
}

async function buildAutoContext({ user, referenceDate }) {
  if (!user?.companyId) {
    return {};
  }

  const todayStart = startOfDay(referenceDate);
  const todayEnd = endOfDay(referenceDate);
  const monthRange = getMonthBounds(referenceDate);
  const weekRange = getWeekBounds(referenceDate);

  const [todayAgg, monthAgg, weekAgg, employeesCount, shipmentsByShop] =
    await Promise.all([
      prisma.dailyClose.aggregate({
        where: {
          companyId: user.companyId,
          closeDate: { gte: todayStart, lte: todayEnd },
        },
        _sum: { sales: true, losses: true },
        _count: { _all: true },
      }),
      prisma.dailyClose.aggregate({
        where: {
          companyId: user.companyId,
          closeDate: { gte: monthRange.startsAt, lte: monthRange.endsAt },
        },
        _sum: { sales: true, losses: true },
        _count: { _all: true },
      }),
      prisma.dailyClose.aggregate({
        where: {
          companyId: user.companyId,
          closeDate: { gte: weekRange.startsAt, lte: weekRange.endsAt },
        },
        _count: { _all: true },
      }),
      prisma.user.count({
        where: { companyId: user.companyId, isActive: true },
      }),
      prisma.stockMovement.groupBy({
        by: ["shopId"],
        where: {
          companyId: user.companyId,
          shopId: { not: null },
          quantity: { gt: 0 },
          movementDate: { gte: monthRange.startsAt, lte: monthRange.endsAt },
        },
        _sum: { quantity: true },
      }),
    ]);

  const shopIds = shipmentsByShop
    .map((row) => row.shopId)
    .filter(Boolean);
  const shops = shopIds.length
    ? await prisma.shop.findMany({
        where: { id: { in: shopIds } },
        select: { id: true, name: true },
      })
    : [];
  const shopMap = new Map(shops.map((shop) => [shop.id, shop.name]));

  return {
    referenceDate: referenceDate.toISOString(),
    sales: {
      today: Number(todayAgg._sum.sales || 0),
      month: Number(monthAgg._sum.sales || 0),
    },
    losses: {
      today: Number(todayAgg._sum.losses || 0),
      month: Number(monthAgg._sum.losses || 0),
    },
    closings: {
      today: Number(todayAgg._count._all || 0),
      week: Number(weekAgg._count._all || 0),
      month: Number(monthAgg._count._all || 0),
    },
    employees: Number(employeesCount || 0),
    shipmentsByShopMonth: shipmentsByShop.map((row) => ({
      shopId: row.shopId,
      shopName: shopMap.get(row.shopId) || "Loja",
      quantity: Number(row._sum.quantity || 0),
    })),
  };
}

async function callOpenAi({ prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new ApiError("OPENAI_API_KEY nao configurada", 500);
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            "Voce responde perguntas de usuarios sobre o sistema e rotina do hortifruit.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message || "Falha ao chamar a OpenAI";
    throw new ApiError(message, response.status || 502);
  }

  return {
    reply: payload?.choices?.[0]?.message?.content || "",
    model: payload?.model || model,
  };
}

export async function chatWithAi({ message, context, user }) {
  const temporal = extractTemporalContext(context);
  const referenceDate = temporal.date || new Date();
  const autoContext = await buildAutoContext({ user, referenceDate });
  const prompt = buildChatPrompt({
    message,
    context,
    user,
    autoContext,
  });
  const response = await callOpenAi({ prompt });

  if (!response.reply) {
    throw new ApiError("Resposta vazia da IA", 502);
  }

  return response.reply;
}
