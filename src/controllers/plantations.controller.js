import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";

export async function listPlantations(req, res) {
  const companyId =
    req.user.role === "ADMIN"
      ? req.query.companyId || req.user.companyId
      : req.user.companyId;

  const plantations = await prisma.plantation.findMany({
    where: {
      companyId,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(plantations);
}

export async function createPlantation(req, res) {
  const companyId = req.validated.body.companyId || req.user.companyId;

  if (req.user.role !== "ADMIN") {
    throw new ApiError("Apenas admins podem cadastrar plantações", 403);
  }

  const plantation = await prisma.plantation.create({
    data: {
      name: req.validated.body.name,
      location: req.validated.body.location,
      isActive: req.validated.body.isActive,
      companyId,
    },
  });

  res.status(201).json(plantation);
}

export async function updatePlantation(req, res) {
  const { id } = req.validated.params;

  const plantation = await prisma.plantation.update({
    where: { id },
    data: req.validated.body,
  });

  res.json(plantation);
}

export async function deactivatePlantation(req, res) {
  const { id } = req.params;

  const plantation = await prisma.plantation.update({
    where: { id },
    data: { isActive: false },
  });

  res.json(plantation);
}

export async function deletePlantationPermanent(req, res) {
  const { id } = req.params;
  const plantation = await prisma.plantation.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });

  if (!plantation) {
    throw new ApiError("Plantação não encontrada", 404);
  }

  if (plantation.isActive) {
    throw new ApiError(
      "Desative a plantação antes de excluir permanentemente",
      409,
    );
  }

  await prisma.plantation.delete({
    where: { id },
  });

  res.status(204).send();
}
