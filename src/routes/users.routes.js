import { Router } from "express";
import { authenticate, authorizeRole } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createUser,
  listUsers,
  updateUser,
} from "../controllers/users.controller.js";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from "../validators/user.validator.js";

const router = Router();

router.use(authenticate, authorizeRole("ADMIN"));

router.get("/", validate(listUsersQuerySchema), listUsers);
router.post("/", validate(createUserSchema), createUser);
router.patch("/:id", validate(updateUserSchema), updateUser);

export default router;
