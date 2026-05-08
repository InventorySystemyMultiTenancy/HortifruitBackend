import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

export async function listProducts(_req, res) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });

  res.json(products);
}

export async function createProduct(req, res) {
  const product = await prisma.product.create({
    data: req.validated.body,
  });

  res.status(201).json(product);
}

export async function updateProduct(req, res) {
  const { id } = req.validated.params;

  const product = await prisma.product.update({
    where: { id },
    data: req.validated.body,
  });

  res.json(product);
}

export async function deactivateProduct(req, res) {
  const { id } = req.params;

  const product = await prisma.product.update({
    where: { id },
    data: { isActive: false },
  });

  res.json(product);
}

export async function deleteProductPermanent(req, res) {
  const { id } = req.params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!product) {
    throw new ApiError("Produto não encontrado", 404);
  }

  if (product.isActive) {
    throw new ApiError(
      "Desative o produto antes de excluir permanentemente",
      409,
    );
  }

  await prisma.product.delete({
    where: { id },
  });

  res.status(204).send();
}
