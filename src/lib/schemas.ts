import { z } from "zod"

import { normalizeRoomCode } from "./room-code"

export const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code")
  .transform((value) => value.toUpperCase())

export const roomCodeSchema = z
  .string()
  .transform(normalizeRoomCode)
  .pipe(
    z
      .string()
      .min(6, "Trip code must be 6–8 characters")
      .max(8, "Trip code must be 6–8 characters")
  )

export const memberNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(40, "Name is too long")

export const splitModeSchema = z.enum(["EQUAL", "PARTS", "AMOUNT"])
export type SplitMode = z.infer<typeof splitModeSchema>

export const expenseCategorySchema = z
  .string()
  .trim()
  .max(32, "Category is too long")
  .optional()
  .transform((value) => (value ? value : undefined))

export const createRoomSchema = z.object({
  name: z.string().trim().min(1, "Name your trip").max(60, "Name is too long"),
  currency: currencyCodeSchema,
  currencies: z.array(currencyCodeSchema).optional().default([]),
  fxRates: z.record(currencyCodeSchema, z.number().positive()).optional(),
  memberNames: z.array(memberNameSchema).min(2, "Add at least two members"),
})

export const joinRoomSchema = z.object({
  code: roomCodeSchema,
  memberName: memberNameSchema,
})

export const claimMemberSchema = z.object({
  code: roomCodeSchema,
  memberId: z.string().min(1, "Missing member"),
})

export const getRoomByCodeSchema = z.object({
  code: roomCodeSchema,
  viewerMemberId: z.string().min(1).optional(),
})

export const expenseSplitSchema = z.object({
  memberId: z.string().min(1),
  weight: z.number().int().min(0).optional(),
  amountCents: z.number().int().min(0).optional(),
})

const expenseWriteBaseSchema = z.object({
  code: roomCodeSchema,
  title: z
    .string()
    .trim()
    .min(1, "Add a short title")
    .max(80, "Title is too long"),
  amountCents: z.number().int().positive("Enter a valid amount"),
  category: expenseCategorySchema,
  currency: currencyCodeSchema.optional(),
  paidById: z.string().min(1, "Pick who paid"),
  splitMode: splitModeSchema.default("EQUAL"),
  isPersonal: z.boolean().default(false),
  splits: z.array(expenseSplitSchema).min(1, "Pick at least one person"),
})

function validateExpenseWrite(
  value: z.infer<typeof expenseWriteBaseSchema>,
  ctx: z.RefinementCtx
) {
  if (value.isPersonal) {
    if (
      value.splits.length !== 1 ||
      value.splits[0]?.memberId !== value.paidById
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Personal expenses must be assigned only to you",
        path: ["splits"],
      })
    }
    return
  }

  if (value.splitMode === "AMOUNT") {
    let sum = 0
    for (const split of value.splits) {
      if (typeof split.amountCents !== "number") {
        ctx.addIssue({
          code: "custom",
          message: "Every person needs an amount",
          path: ["splits"],
        })
        return
      }
      sum += split.amountCents
    }
    if (sum !== value.amountCents) {
      ctx.addIssue({
        code: "custom",
        message: "Custom amounts must sum to the total",
        path: ["splits"],
      })
    }
  }

  if (value.splitMode === "PARTS") {
    const totalWeight = value.splits.reduce(
      (total, split) => total + (split.weight ?? 0),
      0
    )
    if (totalWeight <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Give at least one person some parts",
        path: ["splits"],
      })
    }
  }
}

export const addExpenseSchema =
  expenseWriteBaseSchema.superRefine(validateExpenseWrite)

export const updateExpenseSchema = expenseWriteBaseSchema
  .extend({
    expenseId: z.string().min(1, "Missing expense"),
  })
  .superRefine(validateExpenseWrite)

export const deleteExpenseSchema = z.object({
  code: roomCodeSchema,
  expenseId: z.string().min(1, "Missing expense"),
})

export const reorderExpensesSchema = z.object({
  code: roomCodeSchema,
  expenseIds: z.array(z.string().min(1)).min(1, "Nothing to reorder"),
})

export const recordSettlementSchema = z.object({
  code: roomCodeSchema,
  fromMemberId: z.string().min(1, "Pick who paid"),
  toMemberId: z.string().min(1, "Pick who received"),
  amountCents: z.number().int().positive("Enter a valid amount"),
  currency: currencyCodeSchema.optional(),
})

export const deleteSettlementSchema = z.object({
  code: roomCodeSchema,
  settlementId: z.string().min(1, "Missing settlement"),
})

export type CreateRoomInput = z.input<typeof createRoomSchema>
export type JoinRoomInput = z.input<typeof joinRoomSchema>
export type AddExpenseInput = z.input<typeof addExpenseSchema>
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>
export type DeleteExpenseInput = z.input<typeof deleteExpenseSchema>
export type ReorderExpensesInput = z.input<typeof reorderExpensesSchema>
export type RecordSettlementInput = z.input<typeof recordSettlementSchema>
export type DeleteSettlementInput = z.input<typeof deleteSettlementSchema>
export type ExpenseSplitInput = z.input<typeof expenseSplitSchema>
