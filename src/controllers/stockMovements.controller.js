import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

function decimal(value) {
  return new Prisma.Decimal(value || 0);
}

export async function listStockMovements(req, res) {
  const companyId = req.user.companyId;
  const query = req.validated.query;
  const shopId = req.user.role === "ADMIN" ? query.shopId : req.user.shopId;

  const stockMoves = await prisma.stockMovement.findMany({
    where: {
      companyId,
      ...(shopId ? { shopId } : {}),
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
    req.user.role === "ADMIN" ? body.shopId || null : req.user.shopId;

  if (
    req.user.role !== "ADMIN" &&
    body.shopId &&
    body.shopId !== req.user.shopId
  ) {
    throw new ApiError(
      "Funcionário só pode lançar movimentação para a própria loja",
      403,
    );
  }

  const movement = await prisma.stockMovement.create({
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

  await prisma.stockMovement.delete({
    where: { id },
  });

  res.status(204).send();
}
