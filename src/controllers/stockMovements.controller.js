import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

function decimal(value) {
  return new Prisma.Decimal(value || 0);
}

function stockEntryCostMarker(movementId) {
  return `AUTO_STOCK_ENTRY_COST:${movementId}`;
}

export async function listStockMovements(req, res) {
  const companyId = req.user.companyId;
  const query = req.validated.query;
  const workerShopIds = req.user.shopIds || [];

  const stockMoves = await prisma.stockMovement.findMany({
    where: {
      companyId,
      ...(req.user.role === "ADMIN"
        ? query.shopId
          ? { shopId: query.shopId }
          : {}
        : workerShopIds.length
          ? { shopId: { in: workerShopIds } }
          : { shopId: "__NO_WORKER_SHOP__" }),
      ...(query.plantationId ? { plantationId: query.plantationId } : {}),
      ...(query.startDate || query.endDate
        ? {
            movementDate: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
    },
    include: {
      product: true,
      plantation: true,
      shop: true,
    },
    orderBy: { movementDate: "desc" },
  });

  res.json(stockMoves);
}

export async function createStockMovement(req, res) {
  const body = req.validated.body;
  const companyId = body.companyId || req.user.companyId;
  const shopId =
    req.user.role === "ADMIN"
      ? body.shopId || null
      : body.shopId || req.user.shopId;

  if (req.user.role !== "ADMIN") {
    const workerShopIds = req.user.shopIds || [];
    if (!shopId || !workerShopIds.includes(shopId)) {
      throw new ApiError(
        "Funcionário só pode lançar movimentação para loja vinculada",
        403,
      );
    }
  }

  const movement = await prisma.$transaction(async (tx) => {
    const createdMovement = await tx.stockMovement.create({
      data: {
        companyId,
        productId: body.productId,
        plantationId: body.plantationId || null,
        shopId,
        quantity: decimal(body.quantity),
        unitCost: body.unitCost == null ? null : decimal(body.unitCost),
        movementDate: body.movementDate,
        notes: body.notes,
      },
      include: {
        product: true,
        plantation: true,
        shop: true,
      },
    });

    if (body.unitCost != null) {
      const quantity = decimal(body.quantity);
      const unitCost = decimal(body.unitCost);
      const totalCost = quantity.mul(unitCost);
      const marker = stockEntryCostMarker(createdMovement.id);

      await tx.cost.create({
        data: {
          companyId,
          shopId,
          plantationId: body.plantationId || null,
          name: `Custo de entrada: ${createdMovement.product.name}`,
          nature: "VARIABLE",
          scope: shopId ? "SHOP" : "COMPANY",
          amount: totalCost,
          dueDate: createdMovement.movementDate,
          notes: `${marker} | Calculado automaticamente: ${body.quantity} x ${body.unitCost}`,
        },
      });
    }

    return createdMovement;
  });

  res.status(201).json(movement);
}

export async function updateStockMovement(req, res) {
  const { id } = req.validated.params;
  const body = req.validated.body;

  const movement = await prisma.stockMovement.update({
    where: { id },
    data: {
      ...(body.productId ? { productId: body.productId } : {}),
      ...(body.plantationId !== undefined
        ? { plantationId: body.plantationId }
        : {}),
      ...(body.shopId !== undefined ? { shopId: body.shopId } : {}),
      ...(body.quantity !== undefined
        ? { quantity: decimal(body.quantity) }
        : {}),
      ...(body.unitCost !== undefined
        ? { unitCost: body.unitCost == null ? null : decimal(body.unitCost) }
        : {}),
      ...(body.movementDate ? { movementDate: body.movementDate } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
    include: {
      product: true,
      plantation: true,
      shop: true,
    },
  });

  res.json(movement);
}

export async function deleteStockMovement(req, res) {
  const { id } = req.params;

  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.delete({
      where: { id },
    });

    await tx.cost.deleteMany({
      where: {
        companyId: req.user.companyId,
        notes: {
          startsWith: stockEntryCostMarker(id),
        },
      },
    });
  });

  res.status(204).send();
}

/**
 * Calcula o saldo de estoque por produto em uma loja
 * saldo = sum(quantidade) de todas as movimentações
 */
export async function getShopStockBalance(req, res) {
  const { shopId } = req.validated.params;
  const companyId = req.user.companyId;
  const targetShopId =
    req.user.role === "ADMIN" ? shopId : shopId || req.user.shopId;

  if (!targetShopId) {
    throw new ApiError("Funcionário sem loja vinculada", 403);
  }

  if (
    req.user.role !== "ADMIN" &&
    !(req.user.shopIds || []).includes(targetShopId)
  ) {
    throw new ApiError("Sem permissão para visualizar esta loja", 403);
  }

  // Agrupar movimentações por produto e somar quantidades
  const stockBalance = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: {
      companyId,
      shopId: targetShopId,
    },
    _sum: {
      quantity: true,
    },
  });

  // Enriquecer com dados do produto
  const balanceWithProducts = await Promise.all(
    stockBalance.map(async (balance) => {
      const product = await prisma.product.findUnique({
        where: { id: balance.productId },
      });
      return {
        productId: balance.productId,
        productName: product?.name || "Produto desconhecido",
        unit: product?.unit,
        quantity: balance._sum.quantity || 0,
      };
    }),
  );

  res.json(balanceWithProducts);
}

/**
 * Registra venda/desperdício em uma loja
 * Cria movimentação negativa e lança custo automaticamente
 */
export async function registerSaleOrLoss(req, res) {
  const body = req.validated.body;
  const companyId = req.user.companyId;
  const shopId =
    req.user.role === "ADMIN" ? body.shopId : body.shopId || req.user.shopId;

  if (req.user.role !== "ADMIN") {
    const workerShopIds = req.user.shopIds || [];
    if (!shopId || !workerShopIds.includes(shopId)) {
      throw new ApiError(
        "Funcionário só pode registrar movimentação para loja vinculada",
        403,
      );
    }
  }

  // Validar estoque disponível
  const currentBalance = await prisma.stockMovement.aggregate({
    where: {
      companyId,
      shopId,
      productId: body.productId,
    },
    _sum: { quantity: true },
  });

  const available = decimal(currentBalance._sum.quantity || 0);
  const quantityToRemove = decimal(body.quantity);

  if (available.minus(quantityToRemove).lt(0)) {
    throw new ApiError(
      `Estoque insuficiente. Disponível: ${available.toString()}, solicitado: ${body.quantity}`,
      400,
    );
  }

  // Criar movimentação negativa (venda ou desperdício)
  const movement = await prisma.stockMovement.create({
    data: {
      companyId,
      productId: body.productId,
      shopId,
      quantity: decimal(-body.quantity), // Negativa
      unitCost: body.unitCost ? decimal(body.unitCost) : null,
      movementDate: body.movementDate
        ? new Date(body.movementDate)
        : new Date(),
      notes: `${body.type === "venda" ? "Venda" : "Desperdício"}: ${body.notes || ""}`,
    },
    include: {
      product: true,
      shop: true,
    },
  });

  // Se for venda, lançar custo automaticamente
  if (body.type === "venda" && body.unitCost) {
    const totalCost = quantityToRemove.mul(decimal(body.unitCost));

    await prisma.cost.create({
      data: {
        companyId,
        shopId,
        name: `Custo de venda: ${movement.product.name}`,
        nature: "VARIABLE",
        scope: "SHOP",
        amount: totalCost,
        dueDate: new Date(),
        notes: `Lançado automaticamente para venda de ${body.quantity} ${movement.product.unit}`,
      },
    });
  }

  res.status(201).json({
    movement,
    message:
      body.type === "venda"
        ? "Venda registrada e custo lançado automaticamente"
        : "Desperdício registrado",
  });
}

/**
 * Calcula saldo de estoque para TODOS os produtos em uma loja
 * Incluindo dados resumidos
 */
export async function getShopStockSummary(req, res) {
  const { shopId } = req.validated.params;
  const companyId = req.user.companyId;
  const targetShopId =
    req.user.role === "ADMIN" ? shopId : shopId || req.user.shopId;

  if (!targetShopId) {
    throw new ApiError("Funcionário sem loja vinculada", 403);
  }

  if (
    req.user.role !== "ADMIN" &&
    !(req.user.shopIds || []).includes(targetShopId)
  ) {
    throw new ApiError("Sem permissão para visualizar esta loja", 403);
  }

  // Buscar todas as movimentações da loja agrupadas por produto
  const movements = await prisma.stockMovement.findMany({
    where: {
      companyId,
      shopId: targetShopId,
    },
    include: {
      product: true,
    },
  });

  // Agrupar por produto e calcular totais
  const groupedByProduct = movements.reduce((acc, move) => {
    const productId = move.productId;
    if (!acc[productId]) {
      acc[productId] = {
        productId,
        productName: move.product.name,
        unit: move.product.unit,
        quantity: 0,
        movements: [],
      };
    }
    acc[productId].quantity += Number(move.quantity);
    acc[productId].movements.push(move);
    return acc;
  }, {});

  const summary = Object.values(groupedByProduct);

  res.json({
    shopId: targetShopId,
    totalProducts: summary.length,
    products: summary,
  });
}
