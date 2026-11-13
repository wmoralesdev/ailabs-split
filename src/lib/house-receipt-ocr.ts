import { z } from "zod"

import type { HouseCategory } from "@/lib/house-categories"
import type { DueThisMonthItem } from "@/lib/house-ledger"
import { isMonthKey, monthKey } from "@/lib/house-month"
import { formatMoney } from "@/lib/settle"

export type HouseScanKind = "UTILITY" | "GROCERY"

export type HouseScanDraft = {
  kind: HouseScanKind
  title: string
  category: HouseCategory
  amountCents: number | null
  periodMonth: string | null
  dueOn: string | null
  previousBalanceCents: number | null
  lateFeeCents: number | null
  /** Utility receipts keep the photo on the charge. Grocery tickets do not. */
  savePhoto: boolean
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export const houseReceiptExtractSchema = z.object({
  documentKind: z
    .enum(["UTILITY", "GROCERY"])
    .describe(
      "UTILITY for power, water, gas, internet, phone. GROCERY for supermarket, hardware, or shop tickets"
    ),
  provider: z
    .string()
    .nullable()
    .describe("Printed company or shop name, never the account holder"),
  periodMonth: z
    .string()
    .nullable()
    .describe("Billed month as YYYY-MM if printed, else null"),
  dueOn: z
    .string()
    .nullable()
    .describe("Printed due date as YYYY-MM-DD if printed, else null"),
  totalCents: z
    .number()
    .nullable()
    .describe("Printed amount due in integer cents. 47.20 USD → 4720"),
  previousBalanceCents: z
    .number()
    .nullable()
    .describe("Printed previous balance or saldo anterior in cents, else null"),
  lateFeeCents: z
    .number()
    .nullable()
    .describe("Printed late fee or mora in cents, else null"),
})

export type HouseReceiptExtract = z.infer<typeof houseReceiptExtractSchema>

export const HOUSE_RECEIPT_VISION_INSTRUCTIONS = `Extract a household utility bill or a grocery/shop ticket into the JSON schema.

Amounts are integer cents (47.20 → 4720). totalCents is the printed amount due, not an earlier subtotal.

documentKind is UTILITY for electricity, water, gas, internet, or phone bills. documentKind is GROCERY for supermarket, hardware, pharmacy, or similar shop tickets.

For a utility bill, read provider, billed month (periodMonth as YYYY-MM), due date (dueOn as YYYY-MM-DD), and the printed total. If a previous balance / saldo anterior or late fee / mora is printed, put those in previousBalanceCents and lateFeeCents. Do not add them into totalCents.

Never extract NIC, NIS, account number, meter number, service address, or the account holder / titular name. provider is the company, not the person.

For a grocery ticket, provider is the shop name and totalCents is the payable total. Ignore line items.

If the photo is unreadable, return nulls.`

export function inferHouseCategory(input: {
  kind: HouseScanKind
  provider?: string | null
}): HouseCategory {
  if (input.kind === "GROCERY") return "GROCERIES"
  const text = (input.provider ?? "").toLowerCase()
  if (/internet|wifi|claro|tigo|movistar|starlink|fiber|fibra/.test(text)) {
    return "INTERNET"
  }
  if (/netflix|spotify|disney|hbo|prime video|max\b/.test(text)) {
    return "SUBSCRIPTIONS"
  }
  return "UTILITIES"
}

export function matchVariableDue(
  category: HouseCategory,
  periodMonth: string | null,
  items: DueThisMonthItem[]
): DueThisMonthItem | null {
  const matches = items.filter(
    (item) => item.kind === "VARIABLE" && item.category === category
  )
  if (matches.length === 0) return null
  if (periodMonth) {
    const period = matches.find((item) => item.periodMonth === periodMonth)
    if (period) return period
  }
  return matches[0] ?? null
}

function nonempty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function cents(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded > 0 ? rounded : null
}

export function draftFromHouseExtract(
  extract: HouseReceiptExtract
): HouseScanDraft {
  const kind: HouseScanKind =
    extract.documentKind === "GROCERY" ? "GROCERY" : "UTILITY"
  const provider = nonempty(extract.provider)
  const title = provider ?? (kind === "GROCERY" ? "Groceries" : "Utilities")
  const periodMonth =
    extract.periodMonth && isMonthKey(extract.periodMonth)
      ? extract.periodMonth
      : extract.dueOn && ISO_DAY.test(extract.dueOn)
        ? extract.dueOn.slice(0, 7)
        : null
  const dueOn =
    extract.dueOn && ISO_DAY.test(extract.dueOn) ? extract.dueOn : null
  const category = inferHouseCategory({ kind, provider })
  return {
    kind,
    title,
    category,
    amountCents: cents(extract.totalCents),
    periodMonth,
    dueOn,
    previousBalanceCents: cents(extract.previousBalanceCents),
    lateFeeCents: cents(extract.lateFeeCents),
    savePhoto: kind === "UTILITY",
  }
}

export function parseHouseReceiptExtract(
  raw: unknown
): HouseReceiptExtract | null {
  const parsed = houseReceiptExtractSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function fixtureHouseExtract(
  kind: "utility" | "grocery"
): HouseReceiptExtract {
  if (kind === "grocery") {
    return {
      documentKind: "GROCERY",
      provider: "Super Selectos",
      periodMonth: null,
      dueOn: null,
      totalCents: 1865,
      previousBalanceCents: null,
      lateFeeCents: null,
    }
  }
  const month = monthKey()
  return {
    documentKind: "UTILITY",
    provider: "CAESS",
    periodMonth: month,
    dueOn: `${month}-05`,
    totalCents: 4720,
    previousBalanceCents: 850,
    lateFeeCents: null,
  }
}

export function extraChargeNote(
  draft: HouseScanDraft,
  currency: string
): string | null {
  const bits: string[] = []
  if (draft.previousBalanceCents) {
    bits.push(
      `a previous balance of ${formatMoney(draft.previousBalanceCents, currency)}`
    )
  }
  if (draft.lateFeeCents) {
    bits.push(`a late fee of ${formatMoney(draft.lateFeeCents, currency)}`)
  }
  if (bits.length === 0) return null
  return `Receipt also lists ${bits.join(" and ")}. It is not in this charge.`
}
