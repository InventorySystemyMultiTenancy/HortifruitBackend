import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { calculateFinalBalance } from "../utils/calculateFinalBalance.js";

function decimal(value) {
  return new Prisma.Decimal(value || 0);
}

function asNumber(value) {
  return Number(value || 0);
}

function mapManualItems(items) {
  if (!items) return undefined;
  return {
    deleteMany: {},
    create: items.map((item) => ({
      productId: item.productId || null,
      kind: item.kind,
      amount: decimal(item.amount),
      quantity: item.quantity == null ? null : decimal(item.quantity),
    })),
  };
}

function closeDateValue(dateLike) {
  const date = new Date(dateLike);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

async function buildProductClosePayload({ companyId, shopId, productEntries }) {
  if (!productEntries?.length) {
    return {
      closeItems: undefined,
      movementRows: [],
    };
  }

  const productIds = [
    ...new Set(productEntries.map((entry) => entry.productId)),
  ];

  const [products, groupedStock] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, name: true, unit: true, suggestedPrice: true },
    }),
    prisma.stockMovement.groupBy({
      by: ["productId"],
      where: {
        companyId,
        shopId,
        productId: { in: productIds },
      },
      _sum: { quantity: true },
    }),
  ]);

  const productMap = new Map(products.map((product) => [product.id, product]));
  const stockMap = new Map(
    groupedStock.map((row) => [row.productId, asNumber(row._sum.quantity)]),
  );

  const closeItems = [];
  const movementRows = [];

  for (const entry of productEntries) {
    const product = productMap.get(entry.productId);

    if (!product) {
      throw new ApiError("Produto inválido no fechamento diário", 400);
    }

    const soldQuantity = asNumber(entry.soldQuantity);
    const lossQuantity = asNumber(entry.lossQuantity);
    const totalOut = soldQuantity + lossQuantity;
    const available = stockMap.get(entry.productId) ?? 0;

    if (totalOut > available) {
      throw new ApiError(
        `Estoque insuficiente para ${product.name}. Disponível: ${available.toFixed(3)}, saída solicitada: ${totalOut.toFixed(3)}`,
        400,
      );
    }

    const autoRemaining = available - totalOut;
    const remainingQuantity =
      entry.remainingQuantity == null
        ? autoRemaining
        : asNumber(entry.remainingQuantity);

    if (remainingQuantity < 0) {
      throw new ApiError(
        `Saldo final negativo para ${product.name}. Ajuste venda/perda ou estoque informado.`,
        400,
      );
    }

    const suggestedPrice = asNumber(product.suggestedPrice);

    if (soldQuantity > 0) {
      closeItems.push({
        productId: product.id,
        kind: "VENDA",
        amount: decimal(soldQuantity * suggestedPrice),
        quantity: decimal(soldQuantity),
      });

      movementRows.push({
        productId: product.id,
        quantity: decimal(-soldQuantity),
        unitCost: decimal(suggestedPrice),
        noteType: "VENDA",
      });
    }

    if (lossQuantity > 0) {
      closeItems.push({
        productId: product.id,
        kind: "PERDA",
        amount: decimal(lossQuantity * suggestedPrice),
        quantity: decimal(lossQuantity),
      });

      movementRows.push({
        productId: product.id,
        quantity: decimal(-lossQuantity),
        unitCost: decimal(suggestedPrice),
        noteType: "PERDA",
      });
    }

    closeItems.push({
      productId: product.id,
      kind: "ESTOQUE_FINAL",
      amount: decimal(0),
      quantity: decimal(remainingQuantity),
    });
  }

  return { closeItems, movementRows };
}

export async function upsertDailyClose({ id, data, user }) {
  const finalBalance = data.finalBalance ?? calculateFinalBalance(data);
  const companyId = data.companyId || user.companyId;
  const shopId = user.role === "ADMIN" ? data.shopId : user.shopId;

  if (user.role !== "ADMIN" && data.shopId && data.shopId !== user.shopId) {
    throw new ApiError(
      "Funcionário só pode lançar fechamento na própria loja",
      403,
    );
  }

  if (id && data.productEntries?.length) {
    throw new ApiError(
      "Edição com itens por produto ainda não é suportada. Crie um novo fechamento para aplicar movimentações automáticas.",
      400,
    );
  }

  if (id) {
    const existing = await prisma.dailyClose.findUnique({
      where: { id },
      select: { id: true, shopId: true, companyId: true },
    });

    if (!existing) {
      throw new ApiError("Fechamento não encontrado", 404);
    }

    if (user.role !== "ADMIN" && existing.shopId !== user.shopId) {
      throw new ApiError(
        "Funcionário só pode alterar o fechamento da própria loja",
        403,
      );
    }

    return prisma.dailyClose.update({
      where: { id },
      data: {
        openingAmount: decimal(data.openingAmount ?? 0),
        replenishment: decimal(data.replenishment ?? 0),
        losses: decimal(data.losses ?? 0),
        sales: decimal(data.sales ?? 0),
        finalBalance: decimal(finalBalance),
        status: data.status,
        notes: data.notes,
        items: mapManualItems(data.items),
      },
      include: {
        items: true,
      },
    });
  }

  const existing = await prisma.dailyClose.findUnique({
    where: {
      shopId_closeDate: {
        shopId,
        closeDate: data.closeDate,
      },
    },
  });

  if (existing) {
    throw new ApiError("Já existe fechamento para essa loja nessa data", 409);
  }

  const { closeItems, movementRows } = await buildProductClosePayload({
    companyId,
    shopId,
    productEntries: data.productEntries,
  });

  const movementDate = closeDateValue(data.closeDate);

  return prisma.$transaction(async (tx) => {
    const dailyClose = await tx.dailyClose.create({
      data: {
        companyId,
        shopId,
        closeDate: data.closeDate,
        openingAmount: decimal(data.openingAmount ?? 0),
        replenishment: decimal(data.replenishment ?? 0),
        losses: decimal(data.losses ?? 0),
        sales: decimal(data.sales ?? 0),
        finalBalance: decimal(finalBalance),
        notes: data.notes,
        createdById: user.id,
        items: closeItems?.length
          ? {
              create: closeItems,
            }
          : data.items
            ? {
                create: data.items.map((item) => ({
                  productId: item.productId || null,
                  kind: item.kind,
                  amount: decimal(item.amount),
                  quantity:
                    item.quantity == null ? null : decimal(item.quantity),
                })),
              }
            : undefined,
      },
      include: {
        items: true,
      },
    });

    if (movementRows.length > 0) {
      await Promise.all(
        movementRows.map((row) =>
          tx.stockMovement.create({
            data: {
              companyId,
              shopId,
              productId: row.productId,
              quantity: row.quantity,
              unitCost: row.unitCost,
              movementDate,
              notes: `DAILY_CLOSE:${dailyClose.id}:${row.noteType}`,
            },
          }),
        ),
      );
    }

    return dailyClose;
  });
}
