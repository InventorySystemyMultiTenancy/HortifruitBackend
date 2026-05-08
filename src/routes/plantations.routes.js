import { Router } from "express";
import { authenticate, authorizeRole } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createPlantation,
  deactivatePlantation,
  deletePlantationPermanent,
  listPlantations,
  updatePlantation,
} from "../controllers/plantations.controller.js";
import {
  createPlantationSchema,
  updatePlantationSchema,
} from "../validators/plantation.validator.js";

const router = Router();

router.use(authenticate);

router.get("/", listPlantations);
router.post(
  "/",
  authorizeRole("ADMIN"),
  validate(createPlantationSchema),
  createPlantation,
);
router.patch(
  "/:id",
  authorizeRole("ADMIN"),
  validate(updatePlantationSchema),
  updatePlantation,
);
router.delete("/:id", authorizeRole("ADMIN"), deactivatePlantation);
router.delete(
  "/:id/permanent",
  authorizeRole("ADMIN"),
  deletePlantationPermanent,
);

export default router;
