import { z } from "zod";

export const chatSchema = z.object({
  body: z.object({
    message: z.string().min(1),
    context: z.union([z.string().min(1), z.record(z.any())]).optional(),
  }),
});
