import { prisma } from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { upsertDailyClose } from "../services/dailyClose.service.js";

export async function listDailyCloses(req, res) {
  const companyId =
    req.user.role === "ADMIN"
      ? req.query.companyId || req.user.companyId
      : req.user.companyId;
  const query = req.validated.query;
  const workerShopIds = req.user.shopIds || [];
  const where = {
    companyId,
    ...(req.user.role === "ADMIN"
      ? query.shopId
        ? { shopId: query.shopId }
        : {}
      : workerShopIds.length
        ? { shopId: { in: workerShopIds } }
        : { shopId: "__NO_WORKER_SHOP__" }),
    ...(query.startDate || query.endDate
      ? {
          closeDate: {
            ...(query.startDate ? { gte: query.startDate } : {}),
            ...(query.endDate ? { lte: query.endDate } : {}),
          },
        }
      : {}),
  };

  const closes = await prisma.dailyClose.findMany({
    where,
    include: {
      items: true,
      shop: true,
    },
    orderBy: { closeDate: "desc" },
  });

  res.json(closes);
}

export async function createDailyClose(req, res) {
  const dailyClose = await upsertDailyClose({
    data: req.validated.body,
    user: req.user,
  });

  res.status(201).json(dailyClose);
}

export async function updateDailyClose(req, res) {
  const dailyClose = await upsertDailyClose({
    id: req.validated.params.id,
    data: req.validated.body,
    user: req.user,
  });

  res.json(dailyClose);
}

export async function getDailyCloseById(req, res) {
  const dailyClose = await prisma.dailyClose.findUnique({
    where: { id: req.params.id },
    include: { items: true, shop: true, company: true },
  });

  if (!dailyClose) {
    throw new ApiError("Fechamento não encontrado", 404);
  }

  if (
    req.user.role !== "ADMIN" &&
    !(req.user.shopIds || []).includes(dailyClose.shopId)
  ) {
    throw new ApiError("Sem permissão para visualizar este fechamento", 403);
  }

  res.json(dailyClose);
}
