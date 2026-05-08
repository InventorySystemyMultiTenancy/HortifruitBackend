import { ApiError } from "../utils/apiError.js";
import { sanitizeForLog } from "./requestLogger.js";

export function notFound(_req, _res, next) {
  next(new ApiError("Rota não encontrada", 404));
}

export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message =
    err instanceof ApiError ? err.message : "Erro interno do servidor";
  const requestId = req.requestId || "no-request-id";

  if (statusCode >= 500) {
    console.error(
      `[${requestId}] ${req.method} ${req.originalUrl} failed with ${statusCode}`,
      {
        message: err.message,
        query: sanitizeForLog(req.query || {}),
        params: sanitizeForLog(req.params || {}),
        body: sanitizeForLog(req.body || {}),
        stack: err.stack,
      },
    );
  }

  res.status(statusCode).json({
    error: message,
    requestId,
  });
}
