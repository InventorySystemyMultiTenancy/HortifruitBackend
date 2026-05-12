import { z } from "zod";

const roleSchema = z.enum(["ADMIN", "WORKER"]);

export const listUsersQuerySchema = z.object({
  query: z.object({
    includeInactive: z.coerce.boolean().optional(),
  }),
});

export const createUserSchema = z.object({
  body: z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      role: roleSchema.default("WORKER"),
      shopIds: z.array(z.string().min(1)).default([]),
      isActive: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      if (value.role === "WORKER" && value.shopIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shopIds"],
          message: "Funcionário deve ter ao menos uma loja vinculada",
        });
      }
    }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      name: z.string().min(2).optional(),
      password: z.string().min(6).optional(),
      role: roleSchema.optional(),
      shopIds: z.array(z.string().min(1)).optional(),
      isActive: z.boolean().optional(),
    })
    .superRefine((value, ctx) => {
      if (
        value.role === "WORKER" &&
        value.shopIds &&
        value.shopIds.length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shopIds"],
          message: "Funcionário deve ter ao menos uma loja vinculada",
        });
      }
    }),
});
