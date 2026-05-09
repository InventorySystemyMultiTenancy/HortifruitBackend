import { z } from "zod";

const amount = z.coerce.number().nonnegative();
const quantity = z.coerce.number().nonnegative();

const productEntrySchema = z.object({
  productId: z.string().min(1),
  soldQuantity: quantity.default(0),
  lossQuantity: quantity.default(0),
  remainingQuantity: quantity.optional().nullable(),
});

export const dailyCloseQuerySchema = z.object({
  query: z.object({
    companyId: z.string().min(1).optional(),
    shopId: z.string().min(1).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
  }),
});

export const createDailyCloseSchema = z.object({
  body: z.object({
    companyId: z.string().min(1).optional(),
    shopId: z.string().min(1),
    closeDate: z.coerce.date(),
    openingAmount: amount.default(0),
    replenishment: amount.default(0),
    losses: amount.default(0),
    sales: amount.default(0),
    finalBalance: amount.optional().nullable(),
    notes: z.string().optional().nullable(),
    items: z
      .array(
        z.object({
          productId: z.string().optional().nullable(),
          kind: z.string().min(1),
          amount: amount,
          quantity: z.coerce.number().positive().optional().nullable(),
        }),
      )
      .optional(),
    productEntries: z.array(productEntrySchema).optional(),
  }),
});

export const updateDailyCloseSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    openingAmount: amount.optional(),
    replenishment: amount.optional(),
    losses: amount.optional(),
    sales: amount.optional(),
    finalBalance: amount.optional().nullable(),
    notes: z.string().optional().nullable(),
    status: z.enum(["OPEN", "CLOSED"]).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().optional().nullable(),
          kind: z.string().min(1),
          amount: amount,
          quantity: z.coerce.number().positive().optional().nullable(),
        }),
      )
      .optional(),
    productEntries: z.array(productEntrySchema).optional(),
  }),
});
