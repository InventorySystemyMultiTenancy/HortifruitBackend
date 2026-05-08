import { Router } from "express";
import { authenticate, authorizeRole } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createCost,
  deactivateCost,
  deleteCostPermanent,
  listCosts,
  updateCost,
} from "../controllers/costs.controller.js";
import {
  createCostSchema,
  updateCostSchema,
} from "../validators/cost.validator.js";

const router = Router();

router.use(authenticate);

router.get("/", listCosts);
router.post(
  "/",
  authorizeRole("ADMIN"),
  validate(createCostSchema),
  createCost,
);
router.patch(
  "/:id",
  authorizeRole("ADMIN"),
  validate(updateCostSchema),
  updateCost,
);
router.delete("/:id", authorizeRole("ADMIN"), deactivateCost);
router.delete("/:id/permanent", authorizeRole("ADMIN"), deleteCostPermanent);

export default router;
