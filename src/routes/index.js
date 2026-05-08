import { Router } from "express";
import authRoutes from "./auth.routes.js";
import shopRoutes from "./shops.routes.js";
import costRoutes from "./costs.routes.js";
import dailyCloseRoutes from "./dailyClose.routes.js";
import reportRoutes from "./reports.routes.js";
import productRoutes from "./products.routes.js";
import plantationRoutes from "./plantations.routes.js";
import stockMovementRoutes from "./stockMovements.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/shops", shopRoutes);
router.use("/costs", costRoutes);
router.use("/daily-closes", dailyCloseRoutes);
router.use("/reports", reportRoutes);
router.use("/products", productRoutes);
router.use("/plantations", plantationRoutes);
router.use("/stock-movements", stockMovementRoutes);

export default router;
