import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

import routes from "./routes/index.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { requestLogger } from "./middlewares/requestLogger.js";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/v1", routes);
app.use(notFound);
app.use(errorHandler);

export default app;
