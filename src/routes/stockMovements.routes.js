import { Router } from "express";
import { authenticate, authorizeRole } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createStockMovement,
  deleteStockMovement,
  listStockMovements,
  updateStockMovement,
  getShopStockBalance,
  registerSaleOrLoss,
  getShopStockSummary,
} from "../controllers/stockMovements.controller.js";
import {
  createStockMovementSchema,
  stockMovementQuerySchema,
  updateStockMovementSchema,
} from "../validators/stockMovement.validator.js";
import { z } from "zod";

const router = Router();

router.use(authenticate);

router.get("/", validate(stockMovementQuerySchema), listStockMovements);
router.post("/", validate(createStockMovementSchema), createStockMovement);

// Novo: GET saldo de estoque por loja e produto
router.get(
  "/balance/:shopId",
  validate(z.object({ params: z.object({ shopId: z.string() }) })),
  getShopStockBalance,
);

// Novo: GET resumo de estoque completo de uma loja
router.get(
  "/summary/:shopId",
  validate(z.object({ params: z.object({ shopId: z.string() }) })),
  getShopStockSummary,
);

// Novo: POST para registrar venda/desperdício com custo automático
router.post(
  "/register-sale",
  validate(
    z.object({
      body: z.object({
        productId: z.string(),
        shopId: z.string().optional(),
        quantity: z.number().positive(),
        type: z.enum(["venda", "desperdicio"]),
        unitCost: z.number().optional(),
        notes: z.string().optional(),
        movementDate: z.string().optional(),
      }),
    }),
  ),
  registerSaleOrLoss,
);

router.patch(
  "/:id",
  authorizeRole("ADMIN"),
  validate(updateStockMovementSchema),
  updateStockMovement,
);
router.delete("/:id", authorizeRole("ADMIN"), deleteStockMovement);

export default router;
