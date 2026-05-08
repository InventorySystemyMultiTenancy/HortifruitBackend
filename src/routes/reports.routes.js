import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { getReport } from "../controllers/reports.controller.js";
import { reportQuerySchema } from "../validators/report.validator.js";

const router = Router();

router.use(authenticate);

router.get("/", validate(reportQuerySchema), getReport);

export default router;
