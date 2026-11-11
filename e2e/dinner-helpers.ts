import { expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"

import { E2E_NAME_COOKIE, E2E_USER_COOKIE } from "../src/lib/auth-session"
import {
  COOKIE_CONSENT_KEY,
  COOKIE_CONSENT_VALUE,
} from "../src/lib/cookie-consent"

/** React 19 attach lags the `load` event; clicks before this are no-ops on SSR HTML. */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll("button, a, input, [role='button']")
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key.startsWith("__reactFiber")) return true
      }
    }
    return false
  })
}

export async function skipCookieBanner(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value)
    },
    { key: COOKIE_CONSENT_KEY, value: COOKIE_CONSENT_VALUE }
  )
}

type SignInE2eOptions = { userId?: string; displayName?: string }

/** Playwright-only session cookie. Production ignores it unless E2E=1. */
export async function signInE2e(
  page: Page,
  userIdOrOptions?: string | SignInE2eOptions
): Promise<string> {
  const options =
    typeof userIdOrOptions === "string"
      ? { userId: userIdOrOptions }
      : (userIdOrOptions ?? {})
  const id =
    options.userId ??
    `user_e2e_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`
  const cookies: {
    name: string
    value: string
    url: string
    sameSite: "Lax"
  }[] = [
    {
      name: E2E_USER_COOKIE,
      value: id,
      url: "http://localhost:3000",
      sameSite: "Lax",
    },
  ]
  if (options.displayName) {
    cookies.push({
      name: E2E_NAME_COOKIE,
      value: options.displayName,
      url: "http://localhost:3000",
      sameSite: "Lax",
    })
  }
  await page.context().addCookies(cookies)
  return id
}

export async function openLanding(page: Page) {
  await skipCookieBanner(page)
  await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Split" })).toBeVisible()
  await waitForHydration(page)
  await expect(page.getByRole("button", { name: "Create trip" })).toBeVisible()
}

export async function openDinnerCreate(page: Page) {
  await openLanding(page)
  const dinnerChip = page
    .getByRole("group", { name: "Mode" })
    .getByRole("button", {
      name: "Dinner",
    })
  await expect(async () => {
    await dinnerChip.click()
    await expect(dinnerChip).toHaveAttribute("aria-pressed", "true", {
      timeout: 2_000,
    })
  }).toPass({ timeout: 20_000 })
  await expect(page.getByRole("button", { name: "Scan ticket" })).toBeVisible()
}

async function submitDinnerCreate(
  page: Page,
  creator: string
): Promise<{ code: string; name: string }> {
  await page.getByLabel("Your name").fill(creator)
  await page.getByRole("button", { name: "Create without a ticket" }).click()
  const heading = page.getByRole("heading", {
    level: 1,
    name: /(breakfast|lunch|dinner)$/,
  })
  await expect(heading).toBeVisible()
  await expect(page.getByText("Dinner ready")).toHaveCount(0)
  const code = new URL(page.url()).pathname.split("/")[2] ?? ""
  expect(code.length).toBeGreaterThanOrEqual(6)
  return { code, name: (await heading.innerText()).trim() }
}

/** The no-ticket path: lands on dinner home with the day's fallback name. */
export async function createDinner(
  page: Page,
  creator: string
): Promise<{ code: string; name: string }> {
  await openDinnerCreate(page)
  return submitDinnerCreate(page, creator)
}

/** Same as createDinner, but the landing page is already open. */
export async function createDinnerFromHome(
  page: Page,
  creator: string
): Promise<{ code: string; name: string }> {
  const dinnerChip = page
    .getByRole("group", { name: "Mode" })
    .getByRole("button", { name: "Dinner" })
  await expect(async () => {
    await dinnerChip.click()
    await expect(dinnerChip).toHaveAttribute("aria-pressed", "true", {
      timeout: 2_000,
    })
  }).toPass({ timeout: 20_000 })
  await expect(
    page.getByRole("button", { name: "Create without a ticket" })
  ).toBeVisible()
  return submitDinnerCreate(page, creator)
}

export async function addPeople(page: Page, names: string[]) {
  const field = page.getByLabel("Add people")
  for (const name of names) {
    await field.fill(name)
    await field.press("Enter")
    await expect(
      page.getByRole("button", { name: `Edit ${name}`, exact: true })
    ).toBeVisible()
  }
}

export async function openPersonSheet(page: Page, name: string) {
  await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click()
  const sheet = page.getByRole("dialog")
  await expect(
    sheet.getByRole("heading", { name: "On this bill" })
  ).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible()
  await expect(sheet).toHaveCSS("opacity", "1")
  return sheet
}

/** Guest join: pick an existing name, or add a new one. */
export async function joinDinner(
  page: Page,
  code: string,
  name: string,
  existing = false
) {
  await skipCookieBanner(page)
  await page.goto("/?stay=true&tab=join", { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  const joinTab = page.getByRole("tab", { name: "Join" })
  if (await joinTab.isVisible()) {
    await joinTab.click()
  }
  await page.getByLabel("Code", { exact: true }).fill(code)
  await expect(page.getByText(/Joining dinner/i)).toBeVisible()
  if (existing) {
    const pick = page.getByRole("button", { name })
    await expect(pick).toBeVisible()
    await pick.click()
  } else {
    await page.getByRole("button", { name: /add my name/i }).click()
    await page.getByLabel("Your name").fill(name)
    await page.getByRole("button", { name: "Continue" }).click()
  }
  await expect(page.getByText(`You · ${name}`)).toBeVisible()
}

/** Opens the dinner's one bill: "Enter items by hand" before it exists, the tab bar after. */
export async function openBill(page: Page) {
  const manual = page.getByRole("link", { name: "Enter items by hand" })
  const bill = dinnerNav(page).getByRole("link", { name: "Open the bill" })
  await expect(manual.or(bill).first()).toBeVisible()
  if (await manual.isVisible()) {
    await manual.click()
  } else {
    await bill.click()
  }
  await waitForHydration(page)
  await expect(page.getByLabel("Place")).toBeVisible()
}

export async function addCheckItem(
  page: Page,
  name: string,
  amount: string,
  quantity = 1
) {
  await page.getByLabel("Item", { exact: true }).fill(name)
  await page.getByLabel("Qty", { exact: true }).fill(String(quantity))
  await page.getByLabel("Price", { exact: true }).fill(amount)
  await page.getByRole("button", { name: "Add item" }).click()
  await expect(
    page.getByRole("button", { name: new RegExp(name) })
  ).toBeVisible()
}

/** Inline chips on the item card: the one-tap path. */
export async function assignEqual(
  page: Page,
  itemName: string,
  people: string[]
) {
  const card = itemCard(page, itemName)
  for (const person of people) {
    const chip = card.getByRole("button", { name: person, exact: true })
    await chip.click()
    await expect(chip).toHaveAttribute("aria-pressed", "true")
  }
}

/** The item sheet's Equal tab: the path for editing an existing split. */
export async function assignEqualInSheet(
  page: Page,
  itemName: string,
  people: string[]
) {
  await page.getByRole("button", { name: new RegExp(itemName) }).click()
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByText("Split item")).toBeVisible()
  const equalTab = sheet.getByRole("tab", { name: "Equal" })
  if (await equalTab.isVisible()) {
    await equalTab.click()
  }
  for (const person of people) {
    await sheet
      .getByRole("listitem")
      .filter({ hasText: person })
      .getByRole("button")
      .filter({ hasText: person })
      .click()
  }
  await sheet.getByRole("button", { name: "Save item" }).click()
  await expect(sheet).toBeHidden()
}

export async function assignQuantities(
  page: Page,
  itemName: string,
  shares: Record<string, number>
) {
  await page.getByRole("button", { name: new RegExp(itemName) }).click()
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByText("Split item")).toBeVisible()
  await sheet.getByRole("tab", { name: "Qty" }).click()
  for (const [person, qty] of Object.entries(shares)) {
    const more = sheet.getByRole("button", { name: `More for ${person}` })
    for (let i = 0; i < qty; i += 1) {
      await more.click()
    }
  }
  await sheet.getByRole("button", { name: "Save item" }).click()
  await expect(sheet).toBeHidden()
}

export async function confirmCheck(page: Page) {
  const confirm = page.getByRole("button", {
    name: "Confirm bill",
    exact: true,
  })
  await confirm.scrollIntoViewIfNeeded()
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(
    page.getByRole("navigation", { name: "Dinner navigation" })
  ).toBeVisible()
  await expect(page.getByText("Confirmed").first()).toBeVisible()
}

export function itemCard(page: Page, itemName: string): Locator {
  return page.getByRole("listitem").filter({
    has: page.getByRole("button", { name: new RegExp(itemName) }),
  })
}

export function dinnerNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "Dinner navigation" })
}

export async function renameDinner(page: Page, from: string, to: string) {
  await page.getByRole("button", { name: `Rename ${from}` }).click()
  const sheet = page.getByRole("dialog")
  await expect(
    sheet.getByRole("heading", { name: "Dinner name" })
  ).toBeVisible()
  await sheet.getByRole("textbox", { name: "Dinner" }).fill(to)
  await sheet.getByRole("button", { name: "Save name" }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole("heading", { level: 1, name: to })).toBeVisible()
}

export async function goHome(page: Page) {
  await page.getByRole("link", { name: "Split home" }).click()
  await expect(page.getByRole("heading", { name: "Split" })).toBeVisible()
  await waitForHydration(page)
}

/** Confirmed dinner where `creator` owes `payer` half of `amount`. */
export async function createOwingDinner(
  page: Page,
  input: {
    creator: string
    payer: string
    dinnerName: string
    item: string
    amount: string
    fromHome?: boolean
  }
): Promise<{ code: string; name: string }> {
  const created = input.fromHome
    ? await createDinnerFromHome(page, input.creator)
    : await createDinner(page, input.creator)
  await renameDinner(page, created.name, input.dinnerName)
  await openBill(page)
  await addPeople(page, [input.payer])
  const paidBy = page.getByRole("group", { name: "Paid by" })
  const payerChip = paidBy.getByRole("button", {
    name: input.payer,
    exact: true,
  })
  await payerChip.click()
  await expect(payerChip).toHaveAttribute("aria-pressed", "true")
  await addCheckItem(page, input.item, input.amount)
  await assignEqual(page, input.item, [input.creator, input.payer])
  await confirmCheck(page)
  return { code: created.code, name: input.dinnerName }
}

/** Settle sheet: record the open transfer. Photo is optional. */
export async function recordPayment(
  page: Page,
  options?: { proofPath?: string }
) {
  const sheet = page.getByRole("dialog")
  await expect(
    sheet.getByRole("heading", { name: "Record this payment" })
  ).toBeVisible()
  if (options?.proofPath) {
    await page
      .getByTestId("payment-proof-gallery-input")
      .setInputFiles(options.proofPath)
    await expect(
      sheet.getByRole("img", { name: "Transfer photo" })
    ).toBeVisible()
  } else {
    await expect(
      sheet.getByRole("button", { name: "From photos" })
    ).toBeVisible()
    await expect(
      sheet.getByRole("img", { name: "Transfer photo" })
    ).toHaveCount(0)
  }
  await sheet.getByRole("button", { name: "Record payment" }).click()
  await expect(page.getByText("Payment recorded")).toBeVisible()
  await expect(sheet).toBeHidden()
}
