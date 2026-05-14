import { Router } from "express";
import { authenticate } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { chat } from "../controllers/ai.controller.js";
import { chatSchema } from "../validators/ai.validator.js";

const router = Router();

router.use(authenticate);

router.post("/chat", validate(chatSchema), chat);

export default router;
