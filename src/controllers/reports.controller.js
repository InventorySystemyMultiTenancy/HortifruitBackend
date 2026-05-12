import { buildReport } from "../services/reports.service.js";

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
