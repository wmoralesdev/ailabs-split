import { z } from "zod"

import {
  PAYMENT_PROOF_MAX_BASE64_CHARS,
  PAYMENT_PROOF_MIME_TYPES,
} from "./payment-proof"
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

export const roomKindSchema = z.enum(["TRIP", "DINNER"])
export type RoomKind = z.infer<typeof roomKindSchema>

export const checkStatusSchema = z.enum(["DRAFT", "CONFIRMED"])
export type CheckStatus = z.infer<typeof checkStatusSchema>

export const itemSplitSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("UNASSIGNED") }),
  z.object({
    mode: z.literal("EQUAL"),
    memberIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    mode: z.literal("PARTS"),
    parts: z
      .array(
        z.object({
          memberId: z.string().min(1),
          weight: z.number().int().min(0),
        })
      )
      .min(1),
  }),
  z.object({
    mode: z.literal("QUANTITY"),
    shares: z
      .array(
        z.object({
          memberId: z.string().min(1),
          quantity: z.number().positive(),
        })
      )
      .min(1),
  }),
  z.object({
    mode: z.literal("AMOUNT"),
    shares: z
      .array(
        z.object({
          memberId: z.string().min(1),
          amountCents: z.number().int().min(0),
        })
      )
      .min(1),
  }),
])

export const lineItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  amountCents: z.number().int().min(0),
  modifiers: z.array(z.string().max(80)).max(12),
  source: z.enum(["OCR", "MANUAL"]),
  confidence: z.number().min(0).max(1).nullable(),
  split: itemSplitSchema,
})

export const adjustmentKindSchema = z.enum(["TAX", "FEE", "DISCOUNT", "TIP"])

export const adjustmentSchema = z.object({
  id: z.string().min(1),
  kind: adjustmentKindSchema,
  name: z.string().trim().min(1).max(80),
  amountCents: z.number().int(),
  percent: z.number().nullable().optional(),
  allocate: z.literal("BY_ITEMS"),
  source: z.enum(["OCR", "MANUAL"]),
  confidence: z.number().min(0).max(1).nullable(),
})

export const tipConfigSchema = z.object({
  percent: z.number().nullable(),
  source: z.enum(["TICKET", "MANUAL", "NONE"]),
  printedCents: z.number().int().nullable(),
  amountCents: z.number().int().min(0),
})

export const checkPayloadSchema = z.object({
  items: z.array(lineItemSchema),
  adjustments: z.array(adjustmentSchema),
  tip: tipConfigSchema,
  notedSubtotalCents: z.number().int().nullable(),
  notedTotalCents: z.number().int().nullable(),
  rawText: z.string().max(20_000).optional(),
})

export type CheckPayloadInput = z.infer<typeof checkPayloadSchema>

export const expenseCategorySchema = z
  .string()
  .trim()
  .max(32, "Category is too long")
  .optional()
  .transform((value) => (value ? value : undefined))

export const createRoomSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Give it a name")
      .max(60, "Name is too long"),
    currency: currencyCodeSchema,
    currencies: z.array(currencyCodeSchema).optional().default([]),
    fxRates: z.record(currencyCodeSchema, z.number().positive()).optional(),
    memberNames: z.array(memberNameSchema).min(1, "Add your name"),
    kind: roomKindSchema.optional().default("TRIP"),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "TRIP" && value.memberNames.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "Add at least two members",
        path: ["memberNames"],
      })
    }
  })

export const addRoomMembersSchema = z.object({
  code: roomCodeSchema,
  names: z.array(memberNameSchema).min(1, "Add at least one name"),
})

export const renameRoomMemberSchema = z.object({
  code: roomCodeSchema,
  memberId: z.string().min(1, "Missing person"),
  name: memberNameSchema,
})

export const removeRoomMemberSchema = z.object({
  code: roomCodeSchema,
  memberId: z.string().min(1, "Missing person"),
})

export const renameRoomSchema = z.object({
  code: roomCodeSchema,
  name: z.string().trim().min(1, "Give it a name").max(60, "Name is too long"),
})

export const upsertCheckSchema = z.object({
  code: roomCodeSchema,
  checkId: z.string().min(1).optional(),
  merchant: z.string().trim().min(1, "Name the place").max(80),
  paidById: z.string().min(1, "Pick who paid"),
  isPrecuenta: z.boolean().default(false),
  payload: checkPayloadSchema,
})

export const confirmCheckSchema = z.object({
  code: roomCodeSchema,
  checkId: z.string().min(1, "Missing check"),
})

export const deleteCheckSchema = z.object({
  code: roomCodeSchema,
  checkId: z.string().min(1, "Missing check"),
})

export const revertCheckSchema = z.object({
  code: roomCodeSchema,
  checkId: z.string().min(1, "Missing check"),
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

export const paymentProofSchema = z.object({
  base64: z
    .string()
    .min(32, "Photo is too small")
    .max(
      PAYMENT_PROOF_MAX_BASE64_CHARS,
      "Photo is too large (max ~1MB). Try a closer crop."
    ),
  mimeType: z.enum(PAYMENT_PROOF_MIME_TYPES),
})

export const recordSettlementSchema = z.object({
  code: roomCodeSchema,
  fromMemberId: z.string().min(1, "Pick who paid"),
  toMemberId: z.string().min(1, "Pick who received"),
  amountCents: z.number().int().positive("Enter a valid amount"),
  currency: currencyCodeSchema.optional(),
  proof: paymentProofSchema.optional(),
})

export const deleteSettlementSchema = z.object({
  code: roomCodeSchema,
  settlementId: z.string().min(1, "Missing settlement"),
})

export const getSettlementProofSchema = z.object({
  code: roomCodeSchema,
  settlementId: z.string().min(1, "Missing settlement"),
})

export const fxCalibrationSampleSchema = z.object({
  appCents: z.number().int().positive("Enter a valid app amount"),
  bankCents: z.number().int().positive("Enter a valid bank charge"),
  expenseId: z.string().min(1).optional(),
})

export const calibrateRoomFxSchema = z.object({
  code: roomCodeSchema,
  samples: z
    .array(fxCalibrationSampleSchema)
    .min(1, "Add at least one bank charge")
    .max(5, "Use up to 5 charges"),
})

export type CreateRoomInput = z.input<typeof createRoomSchema>
export type AddRoomMembersInput = z.input<typeof addRoomMembersSchema>
export type RenameRoomMemberInput = z.input<typeof renameRoomMemberSchema>
export type RemoveRoomMemberInput = z.input<typeof removeRoomMemberSchema>
export type UpsertCheckInput = z.input<typeof upsertCheckSchema>
export type ConfirmCheckInput = z.input<typeof confirmCheckSchema>
export type DeleteCheckInput = z.input<typeof deleteCheckSchema>
export type RevertCheckInput = z.input<typeof revertCheckSchema>
export type JoinRoomInput = z.input<typeof joinRoomSchema>
export type AddExpenseInput = z.input<typeof addExpenseSchema>
export type UpdateExpenseInput = z.input<typeof updateExpenseSchema>
export type DeleteExpenseInput = z.input<typeof deleteExpenseSchema>
export type ReorderExpensesInput = z.input<typeof reorderExpensesSchema>
export type RecordSettlementInput = z.input<typeof recordSettlementSchema>
export type DeleteSettlementInput = z.input<typeof deleteSettlementSchema>
export type GetSettlementProofInput = z.input<typeof getSettlementProofSchema>
export type CalibrateRoomFxInput = z.input<typeof calibrateRoomFxSchema>
export type ExpenseSplitInput = z.input<typeof expenseSplitSchema>
