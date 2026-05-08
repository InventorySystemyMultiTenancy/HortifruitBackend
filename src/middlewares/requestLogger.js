import { randomUUID } from "crypto";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "authorization",
  "accessToken",
  "refreshToken",
]);

function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, currentValue]) => {
        if (SENSITIVE_KEYS.has(key)) {
          return [key, "[REDACTED]"];
        }

        return [key, sanitize(currentValue)];
      }),
    );
  }

  return value;
}

export function sanitizeForLog(payload) {
  return sanitize(payload);
}

export function requestLogger(req, res, next) {
  const requestId = randomUUID();
  const start = Date.now();

  req.requestId = requestId;

  console.info(
    `[${requestId}] --> ${req.method} ${req.originalUrl} ${JSON.stringify({
      query: sanitizeForLog(req.query || {}),
      params: sanitizeForLog(req.params || {}),
    })}`,
  );

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    console.info(
      `[${requestId}] <-- ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`,
    );
  });

  next();
}
