import { z } from "zod";

export const reportQuerySchema = z.object({
  query: z.object({
    companyId: z.string().min(1).optional(),
    shopId: z.string().min(1).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
});

export const reportAiSchema = z.object({
  body: z.object({
    companyId: z.string().min(1).optional(),
    shopId: z.string().min(1).optional(),
    date: z.coerce.date().optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    region: z.string().min(2).optional(),
  }),
});
