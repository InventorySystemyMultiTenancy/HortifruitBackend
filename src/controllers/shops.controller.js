import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

export async function listShops(req, res) {
  const companyId =
    req.user.role === "ADMIN"
      ? req.query.companyId || req.user.companyId
      : req.user.companyId;

  const shops = await prisma.shop.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });

  res.json(shops);
}

export async function createShop(req, res) {
  const { companyId, ...data } = req.validated.body;

  if (req.user.role !== "ADMIN" && req.user.companyId !== companyId) {
    throw new ApiError("Não é possível criar loja em outra empresa", 403);
  }

  const shop = await prisma.shop.create({
    data: {
      ...data,
      companyId,
    },
  });

  res.status(201).json(shop);
}

export async function updateShop(req, res) {
  const { id } = req.validated.params;
  const shop = await prisma.shop.update({
    where: { id },
    data: req.validated.body,
  });

  res.json(shop);
}

export async function deactivateShop(req, res) {
  const { id } = req.params;
  const shop = await prisma.shop.update({
    where: { id },
    data: { isActive: false },
  });

  res.json(shop);
}
