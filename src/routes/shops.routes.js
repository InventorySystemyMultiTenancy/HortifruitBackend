import { Router } from "express";
import { authenticate, authorizeRole } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createShop,
  deactivateShop,
  listShops,
  updateShop,
} from "../controllers/shops.controller.js";
import {
  createShopSchema,
  updateShopSchema,
} from "../validators/shop.validator.js";

const router = Router();

router.use(authenticate);

router.get("/", listShops);
router.post(
  "/",
  authorizeRole("ADMIN"),
  validate(createShopSchema),
  createShop,
);
router.patch(
  "/:id",
  authorizeRole("ADMIN"),
  validate(updateShopSchema),
  updateShop,
);
router.delete("/:id", authorizeRole("ADMIN"), deactivateShop);

export default router;
