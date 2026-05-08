import { z } from "zod";

const amount = z.coerce.number().nonnegative();

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    unit: z.enum(["KG", "UNIT"]),
    suggestedPrice: amount,
    sku: z.string().min(1).optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    unit: z.enum(["KG", "UNIT"]).optional(),
    suggestedPrice: amount.optional(),
    sku: z.string().min(1).optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});
