import { z } from "zod";

export const createPlantationSchema = z.object({
  body: z.object({
    companyId: z.string().min(1).optional(),
    name: z.string().min(2),
    location: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});

export const updatePlantationSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(2).optional(),
    location: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});
