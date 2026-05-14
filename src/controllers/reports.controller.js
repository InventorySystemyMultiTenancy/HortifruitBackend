import { buildAiReport, buildReport } from "../services/reports.service.js";

export async function getReport(req, res) {
  const companyId =
    req.user.role === "ADMIN"
      ? req.query.companyId || req.user.companyId
      : req.user.companyId;
  const query = req.validated.query;
  const workerShopIds = req.user.role === "ADMIN" ? [] : req.user.shopIds || [];
  const shopId = req.user.role === "ADMIN" ? query.shopId : undefined;

  const report = await buildReport({
    companyId,
    shopId,
    shopIds: workerShopIds,
    startDate: query.startDate,
    endDate: query.endDate,
    month: query.month,
  });

  res.json(report);
}

export async function getAiReport(req, res) {
  const companyId =
    req.user.role === "ADMIN"
      ? req.validated.body.companyId || req.user.companyId
      : req.user.companyId;
  const body = req.validated.body;
  const workerShopIds = req.user.role === "ADMIN" ? [] : req.user.shopIds || [];
  const shopId = req.user.role === "ADMIN" ? body.shopId : undefined;

  const report = await buildAiReport({
    companyId,
    shopId,
    shopIds: workerShopIds,
    date: body.date,
    month: body.month,
    region: body.region,
  });

  res.json(report);
}
