import { Router } from "express";
import { authenticate, authorizeRole } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createProduct,
  deactivateProduct,
  listProducts,
  updateProduct,
} from "../controllers/products.controller.js";
import {
  createProductSchema,
  updateProductSchema,
} from "../validators/product.validator.js";

const router = Router();

router.use(authenticate);

router.get("/", listProducts);
router.post(
  "/",
  authorizeRole("ADMIN"),
  validate(createProductSchema),
  createProduct,
);
router.patch(
  "/:id",
  authorizeRole("ADMIN"),
  validate(updateProductSchema),
  updateProduct,
);
router.delete("/:id", authorizeRole("ADMIN"), deactivateProduct);

export default router;
