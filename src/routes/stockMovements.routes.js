import { Router } from "express";
import { authenticate, authorizeRole } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createStockMovement,
  deleteStockMovement,
  listStockMovements,
  updateStockMovement,
} from "../controllers/stockMovements.controller.js";
import {
  createStockMovementSchema,
  stockMovementQuerySchema,
  updateStockMovementSchema,
} from "../validators/stockMovement.validator.js";

const router = Router();

router.use(authenticate);

router.get("/", validate(stockMovementQuerySchema), listStockMovements);
router.post("/", validate(createStockMovementSchema), createStockMovement);
router.patch(
  "/:id",
  authorizeRole("ADMIN"),
  validate(updateStockMovementSchema),
  updateStockMovement,
);
router.delete("/:id", authorizeRole("ADMIN"), deleteStockMovement);

export default router;
