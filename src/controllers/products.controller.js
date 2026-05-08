import { prisma } from "../config/prisma.js";

export async function listProducts(_req, res) {
  const products = await prisma.product.findMany({
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
