import { chatWithAi } from "../services/ai.service.js";

export async function chat(req, res) {
  const { message, context } = req.validated.body;

  const reply = await chatWithAi({
    message,
    context,
    user: req.user,
  });

  res.json({ reply });
}
