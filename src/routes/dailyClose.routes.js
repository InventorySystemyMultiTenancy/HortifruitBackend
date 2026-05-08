import { Router } from "express";
import { authenticate, authorizeRole } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createDailyClose,
  getDailyCloseById,
  listDailyCloses,
  updateDailyClose,
} from "../controllers/dailyClose.controller.js";
import {
  createDailyCloseSchema,
  dailyCloseQuerySchema,
  updateDailyCloseSchema,
} from "../validators/dailyClose.validator.js";

const router = Router();

router.use(authenticate);

router.get("/", validate(dailyCloseQuerySchema), listDailyCloses);
router.get("/:id", getDailyCloseById);
router.post("/", validate(createDailyCloseSchema), createDailyClose);
router.patch("/:id", validate(updateDailyCloseSchema), updateDailyClose);
router.post(
  "/:id/finalize",
  authorizeRole("ADMIN", "WORKER"),
  validate(updateDailyCloseSchema),
  updateDailyClose,
);

export default router;
