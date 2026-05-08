import { z } from "zod";

export const createCostSchema = z.object({
  body: z.object({
    companyId: z.string().min(1),
    shopId: z.string().optional().nullable(),
    plantationId: z.string().optional().nullable(),
    name: z.string().min(2),
    nature: z.enum(["FIXED", "VARIABLE"]),
    scope: z.enum(["COMPANY", "SHOP", "PLANTATION"]).default("COMPANY"),
    amount: z.coerce.number().nonnegative(),
    dueDate: z.coerce.date().optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    notes: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});

export const updateCostSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    nature: z.enum(["FIXED", "VARIABLE"]).optional(),
    scope: z.enum(["COMPANY", "SHOP", "PLANTATION"]).optional(),
    amount: z.coerce.number().nonnegative().optional(),
    dueDate: z.coerce.date().optional().nullable(),
    startsAt: z.coerce.date().optional().nullable(),
    endsAt: z.coerce.date().optional().nullable(),
    notes: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});
