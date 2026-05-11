import { z } from "zod";

const costBodySchema = z
  .object({
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
  })
  .superRefine((value, ctx) => {
    if (value.scope === "SHOP" && !value.shopId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shopId"],
        message: "shopId é obrigatório quando o escopo é SHOP",
      });
    }

    if (value.scope === "PLANTATION" && !value.plantationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["plantationId"],
        message: "plantationId é obrigatório quando o escopo é PLANTATION",
      });
    }
  })
  .transform((value) => ({
    ...value,
    shopId: value.scope === "SHOP" ? (value.shopId ?? null) : null,
    plantationId:
      value.scope === "PLANTATION" ? (value.plantationId ?? null) : null,
  }));

export const createCostSchema = z.object({
  body: costBodySchema,
});

export const updateCostSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      name: z.string().min(2).optional(),
      nature: z.enum(["FIXED", "VARIABLE"]).optional(),
      scope: z.enum(["COMPANY", "SHOP", "PLANTATION"]).optional(),
      shopId: z.string().optional().nullable(),
      plantationId: z.string().optional().nullable(),
      amount: z.coerce.number().nonnegative().optional(),
      dueDate: z.coerce.date().optional().nullable(),
      startsAt: z.coerce.date().optional().nullable(),
      endsAt: z.coerce.date().optional().nullable(),
      notes: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.scope === "SHOP" && !value.shopId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shopId"],
          message: "shopId é obrigatório quando o escopo é SHOP",
        });
      }

      if (value.scope === "PLANTATION" && !value.plantationId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["plantationId"],
          message: "plantationId é obrigatório quando o escopo é PLANTATION",
        });
      }
    }),
});
