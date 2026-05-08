import { z } from "zod";

const amount = z.coerce.number().positive();

export const stockMovementQuerySchema = z.object({
  query: z.object({
    shopId: z.string().min(1).optional(),
    plantationId: z.string().min(1).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),
});

export const createStockMovementSchema = z.object({
  body: z.object({
    companyId: z.string().min(1).optional(),
    productId: z.string().min(1),
    plantationId: z.string().min(1).optional().nullable(),
    shopId: z.string().min(1).optional().nullable(),
    quantity: amount,
    unitCost: z.coerce.number().nonnegative().optional().nullable(),
    movementDate: z.coerce.date().optional(),
    notes: z.string().optional().nullable(),
  }),
});

export const updateStockMovementSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    productId: z.string().min(1).optional(),
    plantationId: z.string().min(1).optional().nullable(),
    shopId: z.string().min(1).optional().nullable(),
    quantity: amount.optional(),
    unitCost: z.coerce.number().nonnegative().optional().nullable(),
    movementDate: z.coerce.date().optional(),
    notes: z.string().optional().nullable(),
  }),
});
