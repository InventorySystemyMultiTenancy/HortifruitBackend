import { prisma } from "../config/prisma.js";
import {
  eachDayInRange,
  endOfDay,
  getDaysInMonth,
  startOfDay,
} from "../utils/calculateFinalBalance.js";
import { ApiError } from "../utils/apiError.js";

function buildDateRange({ startDate, endDate, month }) {
  if (month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const firstDay = new Date(year, monthNumber - 1, 1);
    const lastDay = new Date(year, monthNumber, 0);
    return { startDate: startOfDay(firstDay), endDate: endOfDay(lastDay) };
  }

  const start = startDate ? startOfDay(startDate) : startOfDay(new Date());
  const end = endDate ? endOfDay(endDate) : endOfDay(start);
  return { startDate: start, endDate: end };
}

function getMonthBounds(date) {
  return {
    startsAt: startOfDay(new Date(date.getFullYear(), date.getMonth(), 1)),
    endsAt: endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}

function resolveCostWindow(cost) {
  if (cost.startsAt || cost.endsAt) {
    return {
      startsAt: cost.startsAt || cost.dueDate || cost.createdAt,
      endsAt: cost.endsAt || cost.dueDate || cost.createdAt,
    };
  }

  if (cost.nature === "FIXED" && cost.dueDate) {
    return getMonthBounds(cost.dueDate);
  }

  const referenceDate = cost.dueDate || cost.createdAt;
  return {
    startsAt: referenceDate,
    endsAt: referenceDate,
  };
}

function overlapsDay(cost, day) {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const { startsAt, endsAt } = resolveCostWindow(cost);
  return startsAt <= dayEnd && endsAt >= dayStart;
}

function overlapsRange(cost, rangeStart, rangeEnd) {
  const { startsAt, endsAt } = resolveCostWindow(cost);
  return startsAt <= rangeEnd && endsAt >= rangeStart;
}

function getCostDailyAmount(cost, day) {
  if (!overlapsDay(cost, day)) {
    return 0;
  }

  if (cost.nature === "FIXED") {
    return Number(cost.amount) / getDaysInMonth(day);
  }

  const { startsAt, endsAt } = resolveCostWindow(cost);
  const spanDays = Math.max(eachDayInRange(startsAt, endsAt).length, 1);
  return Number(cost.amount) / spanDays;
}

export async function buildReport({
  companyId,
  shopId,
  shopIds,
  plantationId,
  startDate,
  endDate,
  month,
}) {
  const range = buildDateRange({ startDate, endDate, month });
  const scopedShopFilter = shopId
    ? { shopId }
    : Array.isArray(shopIds) && shopIds.length
      ? { shopId: { in: shopIds } }
      : {};

  const dailyCloses = await prisma.dailyClose.findMany({
    where: {
      companyId,
      ...scopedShopFilter,
      ...(plantationId ? { plantationId } : {}),
      closeDate: {
        gte: range.startDate,
        lte: range.endDate,
      },
    },
  });

  let costs;
  if (shopId || (Array.isArray(shopIds) && shopIds.length)) {
    costs = await prisma.cost.findMany({
      where: {
        companyId,
        isActive: true,
        scope: "SHOP",
        ...(shopId ? { shopId } : { shopId: { in: shopIds } }),
      },
    });
  } else if (plantationId) {
    costs = await prisma.cost.findMany({
      where: {
        companyId,
        isActive: true,
        scope: "PLANTATION",
        plantationId,
      },
    });
  } else {
    costs = await prisma.cost.findMany({
      where: {
        companyId,
        isActive: true,
      },
    });
  }

  const grossRevenue = dailyCloses.reduce(
    (sum, item) => sum + Number(item.sales),
    0,
  );
  const lossesTotal = dailyCloses.reduce(
    (sum, item) => sum + Number(item.losses || 0),
    0,
  );
  const netRevenue = grossRevenue - lossesTotal;
  const dailyCosts = eachDayInRange(range.startDate, range.endDate).map(
    (day) => {
      let fixed = 0;
      let variable = 0;
      let plantation = 0;

      for (const cost of costs) {
        if (!overlapsRange(cost, range.startDate, range.endDate)) {
          continue;
        }

        const dailyAmount = getCostDailyAmount(cost, day);

        if (dailyAmount === 0) {
          continue;
        }

        if (cost.nature === "FIXED") {
          fixed += dailyAmount;
        }

        if (cost.nature === "VARIABLE") {
          variable += dailyAmount;
        }

        if (cost.scope === "PLANTATION") {
          plantation += dailyAmount;
        }
      }

      return {
        date: startOfDay(day),
        fixed,
        variable,
        plantation,
        total: fixed + variable + plantation,
      };
    },
  );

  const fixedCostsRateado = dailyCosts.reduce(
    (sum, item) => sum + item.fixed,
    0,
  );
  const variableCosts = dailyCosts.reduce(
    (sum, item) => sum + item.variable,
    0,
  );
  const plantationCosts = dailyCosts.reduce(
    (sum, item) => sum + item.plantation,
    0,
  );

  const totalCosts = fixedCostsRateado + variableCosts + plantationCosts;

  return {
    filters: {
      companyId,
      shopId: shopId || null,
      startDate: range.startDate,
      endDate: range.endDate,
      month: month || null,
    },
    grossRevenue,
    lossesTotal,
    netRevenue,
    costs: {
      fixedRateado: fixedCostsRateado,
      variable: variableCosts,
      plantation: plantationCosts,
      total: totalCosts,
      daily: dailyCosts,
    },
    netResult: netRevenue - totalCosts,
    closes: dailyCloses,
  };
}

function formatYearMonth(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildScopedShopFilter({ shopId, shopIds }) {
  if (shopId) {
    return { shopId };
  }

  if (Array.isArray(shopIds) && shopIds.length) {
    return { shopId: { in: shopIds } };
  }

  return {};
}

async function getCostsForScope({ companyId, shopId, shopIds, plantationId }) {
  if (shopId || (Array.isArray(shopIds) && shopIds.length)) {
    return prisma.cost.findMany({
      where: {
        companyId,
        isActive: true,
        scope: "SHOP",
        ...(shopId ? { shopId } : { shopId: { in: shopIds } }),
      },
    });
  }

  if (plantationId) {
    return prisma.cost.findMany({
      where: {
        companyId,
        isActive: true,
        scope: "PLANTATION",
        plantationId,
      },
    });
  }

  return prisma.cost.findMany({
    where: {
      companyId,
      isActive: true,
    },
  });
}

function getRangeCostsSummary(costs, rangeStart, rangeEnd) {
  const totals = new Map();
  const days = eachDayInRange(rangeStart, rangeEnd);

  for (const cost of costs) {
    if (!overlapsRange(cost, rangeStart, rangeEnd)) {
      continue;
    }

    let total = 0;
    for (const day of days) {
      total += getCostDailyAmount(cost, day);
    }

    if (total <= 0) {
      continue;
    }

    const current = totals.get(cost.name) || {
      name: cost.name,
      nature: cost.nature,
      scope: cost.scope,
      total: 0,
    };

    current.total += total;
    totals.set(cost.name, current);
  }

  return [...totals.values()].sort((a, b) => b.total - a.total);
}

async function getDailyCloseItems({
  companyId,
  shopId,
  shopIds,
  startDate,
  endDate,
}) {
  const scopedShopFilter = buildScopedShopFilter({ shopId, shopIds });

  return prisma.dailyClose.findMany({
    where: {
      companyId,
      ...scopedShopFilter,
      closeDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      id: true,
      closeDate: true,
      items: {
        select: {
          productId: true,
          kind: true,
          amount: true,
          quantity: true,
          product: {
            select: {
              name: true,
              unit: true,
            },
          },
        },
      },
    },
  });
}

async function getLatestCloseDate({
  companyId,
  shopId,
  shopIds,
  beforeDate,
}) {
  const scopedShopFilter = buildScopedShopFilter({ shopId, shopIds });
  const latest = await prisma.dailyClose.findFirst({
    where: {
      companyId,
      ...scopedShopFilter,
      ...(beforeDate ? { closeDate: { lte: beforeDate } } : {}),
    },
    orderBy: { closeDate: "desc" },
    select: { closeDate: true },
  });

  return latest?.closeDate || null;
}

function aggregateProductStats(closes) {
  const stats = new Map();

  for (const close of closes) {
    for (const item of close.items || []) {
      if (!item.productId) {
        continue;
      }

      const current = stats.get(item.productId) || {
        productId: item.productId,
        name: item.product?.name || "Produto",
        unit: item.product?.unit || null,
        soldAmount: 0,
        soldQuantity: 0,
        lossAmount: 0,
        lossQuantity: 0,
      };

      const amount = Number(item.amount || 0);
      const quantity = Number(item.quantity || 0);

      if (item.kind === "VENDA") {
        current.soldAmount += amount;
        current.soldQuantity += quantity;
      }

      if (item.kind === "PERDA") {
        current.lossAmount += amount;
        current.lossQuantity += quantity;
      }

      stats.set(item.productId, current);
    }
  }

  return [...stats.values()].sort((a, b) => {
    if (b.soldAmount === a.soldAmount) {
      return b.soldQuantity - a.soldQuantity;
    }
    return b.soldAmount - a.soldAmount;
  });
}

function buildAiPrompt({
  region,
  todaySummary,
  monthSummary,
  todayProducts,
  monthProducts,
  topCosts,
}) {
  const context = {
    region: region || "Brasil",
    today: todaySummary,
    month: monthSummary,
    productsToday: todayProducts,
    productsMonth: monthProducts,
    topCosts,
  };

  return `Voce e um analista de negocios de hortifruit. Responda em pt-BR, com foco pratico para compras e reducao de custos.\n\nDados internos (JSON):\n${JSON.stringify(
    context,
  )}\n\nRegras:\n- Responda SOMENTE com JSON valido.\n- Se nao houver dados suficientes, diga explicitamente "sem dados" no campo correspondente.\n- Se voce nao conseguir consultar a internet, deixe claro em "observacoes" que a parte de mercado/sazonalidade e baseada em conhecimento geral e precisa de validacao local.\n\nFormato exato:\n{\n  "resumo": "...",\n  "comprarMais": [{"produto": "...", "motivo": "..."}],\n  "gastarMenos": [{"item": "...", "motivo": "..."}],\n  "produtosEmAlta": [{"produto": "...", "motivo": "..."}],\n  "sazonalidade": [{"produto": "...", "janela": "...", "nota": "..."}],\n  "alertas": ["..."],\n  "observacoes": ["..."]\n}`;
}

function extractJsonFromContent(content) {
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content);
  } catch {
    const fenced = content.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }

    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
}

async function callOpenAi(prompt) {
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
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Voce analisa dados financeiros e sugere acoes objetivas para hortifruit.",
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

  const content = payload?.choices?.[0]?.message?.content || "";

  if (!content) {
    throw new ApiError("Resposta vazia da OpenAI", 502);
  }

  const parsed = extractJsonFromContent(content);
  return {
    parsed,
    raw: content,
    model: payload?.model || model,
  };
}

export async function buildAiReport({
  companyId,
  shopId,
  shopIds,
  plantationId,
  date,
  month,
  region,
}) {
  const referenceDate = date ? new Date(date) : new Date();
  let effectiveDate = referenceDate;
  let monthValue = month || formatYearMonth(referenceDate);
  let todayStart = startOfDay(referenceDate);
  let todayEnd = endOfDay(referenceDate);
  let monthRange = buildDateRange({ month: monthValue });

  const costs = await getCostsForScope({
    companyId,
    shopId,
    shopIds,
    plantationId,
  });

  let [todayReport, todayCloses] = await Promise.all([
    buildReport({
      companyId,
      shopId,
      shopIds,
      plantationId,
      startDate: todayStart,
      endDate: todayEnd,
    }),
    getDailyCloseItems({
      companyId,
      shopId,
      shopIds,
      startDate: todayStart,
      endDate: todayEnd,
    }),
  ]);

  if (!todayCloses.length) {
    const latestClose = await getLatestCloseDate({
      companyId,
      shopId,
      shopIds,
      beforeDate: todayEnd,
    });

    if (latestClose) {
      effectiveDate = latestClose;
      todayStart = startOfDay(latestClose);
      todayEnd = endOfDay(latestClose);

      [todayReport, todayCloses] = await Promise.all([
        buildReport({
          companyId,
          shopId,
          shopIds,
          plantationId,
          startDate: todayStart,
          endDate: todayEnd,
        }),
        getDailyCloseItems({
          companyId,
          shopId,
          shopIds,
          startDate: todayStart,
          endDate: todayEnd,
        }),
      ]);

      if (!month) {
        monthValue = formatYearMonth(latestClose);
        monthRange = buildDateRange({ month: monthValue });
      }
    }
  }

  let [monthReport, monthCloses] = await Promise.all([
    buildReport({
      companyId,
      shopId,
      shopIds,
      plantationId,
      month: monthValue,
    }),
    getDailyCloseItems({
      companyId,
      shopId,
      shopIds,
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
    }),
  ]);

  if (!monthCloses.length) {
    const latestClose = await getLatestCloseDate({
      companyId,
      shopId,
      shopIds,
      beforeDate: monthRange.endDate,
    });

    if (latestClose) {
      monthValue = formatYearMonth(latestClose);
      monthRange = buildDateRange({ month: monthValue });

      [monthReport, monthCloses] = await Promise.all([
        buildReport({
          companyId,
          shopId,
          shopIds,
          plantationId,
          month: monthValue,
        }),
        getDailyCloseItems({
          companyId,
          shopId,
          shopIds,
          startDate: monthRange.startDate,
          endDate: monthRange.endDate,
        }),
      ]);
    }
  }

  const todayProducts = aggregateProductStats(todayCloses).slice(0, 10);
  const monthProducts = aggregateProductStats(monthCloses).slice(0, 15);
  const topCosts = getRangeCostsSummary(
    costs,
    monthRange.startDate,
    monthRange.endDate,
  ).slice(0, 10);

  const todaySummary = {
    date: todayStart,
    grossRevenue: todayReport.grossRevenue,
    lossesTotal: todayReport.lossesTotal,
    netRevenue: todayReport.netRevenue,
    totalCosts: todayReport.costs.total,
    netResult: todayReport.netResult,
  };

  const monthSummary = {
    month: monthValue,
    grossRevenue: monthReport.grossRevenue,
    lossesTotal: monthReport.lossesTotal,
    netRevenue: monthReport.netRevenue,
    totalCosts: monthReport.costs.total,
    netResult: monthReport.netResult,
  };

  const prompt = buildAiPrompt({
    region,
    todaySummary,
    monthSummary,
    todayProducts,
    monthProducts,
    topCosts,
  });

  const ai = await callOpenAi(prompt);

  return {
    filters: {
      companyId,
      shopId: shopId || null,
      date: todayStart,
      month: monthValue,
      region: region || "Brasil",
      effectiveDate,
      effectiveMonth: monthValue,
    },
    summary: {
      today: todaySummary,
      month: monthSummary,
    },
    productStats: {
      today: todayProducts,
      month: monthProducts,
    },
    costHighlights: topCosts,
    ai: ai.parsed || { raw: ai.raw },
    aiMeta: {
      model: ai.model,
      parsed: Boolean(ai.parsed),
    },
  };
}
