import { z } from "zod";

export const createShopSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    code: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    companyId: z.string().min(1),
  }),
});

export const updateShopSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    code: z.string().min(1).optional().nullable(),
    city: z.string().min(1).optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});
