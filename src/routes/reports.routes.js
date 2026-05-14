import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { getAiReport, getReport } from "../controllers/reports.controller.js";
import {
	reportAiSchema,
	reportQuerySchema,
} from "../validators/report.validator.js";

const router = Router();

router.use(authenticate);

router.get("/", validate(reportQuerySchema), getReport);
router.post("/ai", validate(reportAiSchema), getAiReport);

export default router;
