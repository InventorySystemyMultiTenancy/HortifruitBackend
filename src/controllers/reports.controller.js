import { buildReport } from "../services/reports.service.js";

export async function getReport(req, res) {
  const companyId =
    req.user.role === "ADMIN"
      ? req.query.companyId || req.user.companyId
      : req.user.companyId;
  const query = req.validated.query;
  const shopId = req.user.role === "ADMIN" ? query.shopId : req.user.shopId;

  const report = await buildReport({
    companyId,
    shopId,
    startDate: query.startDate,
    endDate: query.endDate,
    month: query.month,
  });

  res.json(report);
}
