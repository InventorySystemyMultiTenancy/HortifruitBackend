import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { calculateFinalBalance } from "../utils/calculateFinalBalance.js";

function decimal(value) {
  return new Prisma.Decimal(value || 0);
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
        items: data.items
          ? {
              deleteMany: {},
              create: data.items.map((item) => ({
                productId: item.productId || null,
                kind: item.kind,
                amount: decimal(item.amount),
                quantity: item.quantity == null ? null : decimal(item.quantity),
              })),
            }
          : undefined,
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

  return prisma.dailyClose.create({
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
      items: data.items
        ? {
            create: data.items.map((item) => ({
              productId: item.productId || null,
              kind: item.kind,
              amount: decimal(item.amount),
              quantity: item.quantity == null ? null : decimal(item.quantity),
            })),
          }
        : undefined,
    },
    include: {
      items: true,
    },
  });
}
