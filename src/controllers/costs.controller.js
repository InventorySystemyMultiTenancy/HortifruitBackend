import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

export async function listCosts(req, res) {
  const companyId =
    req.user.role === "ADMIN"
      ? req.query.companyId || req.user.companyId
      : req.user.companyId;
  const where = {
    companyId,
    isActive: true,
    ...(req.query.shopId ? { shopId: req.query.shopId } : {}),
    ...(req.query.plantationId ? { plantationId: req.query.plantationId } : {}),
    ...(req.query.nature ? { nature: req.query.nature } : {}),
    ...(req.query.scope ? { scope: req.query.scope } : {}),
  };

  const costs = await prisma.cost.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  res.json(costs);
}

export async function createCost(req, res) {
  const body = req.validated.body;

  if (req.user.role !== "ADMIN" && req.user.companyId !== body.companyId) {
    throw new ApiError("Sem permissão para lançar custo em outra empresa", 403);
  }

  const cost = await prisma.cost.create({
    data: body,
  });

  res.status(201).json(cost);
}

export async function updateCost(req, res) {
  const { id } = req.validated.params;

  const cost = await prisma.cost.update({
    where: { id },
    data: req.validated.body,
  });

  res.json(cost);
}

export async function deactivateCost(req, res) {
  const { id } = req.params;

  const cost = await prisma.cost.update({
    where: { id },
    data: { isActive: false },
  });

  res.json(cost);
}

export async function deleteCostPermanent(req, res) {
  const { id } = req.params;
  const cost = await prisma.cost.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!cost) {
    throw new ApiError("Custo não encontrado", 404);
  }

  if (cost.isActive) {
    throw new ApiError(
      "Desative o custo antes de excluir permanentemente",
      409,
    );
  }

  await prisma.cost.delete({
    where: { id },
  });

  res.status(204).send();
}
