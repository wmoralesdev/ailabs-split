import { expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"

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

export async function openLanding(page: Page) {
  await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Split" })).toBeVisible()
  await waitForHydration(page)
  await expect(page.getByRole("button", { name: "Create trip" })).toBeVisible()
}

export async function createDinner(
  page: Page,
  name: string,
  creator: string
): Promise<string> {
  await openLanding(page)
  const dinnerChip = page.getByRole("group", { name: "Mode" }).getByRole("button", {
    name: "Dinner",
  })
  await expect(async () => {
    await dinnerChip.click()
    await expect(dinnerChip).toHaveAttribute("aria-pressed", "true", {
      timeout: 2_000,
    })
  }).toPass({ timeout: 20_000 })
  await expect(page.getByRole("button", { name: "Create dinner" })).toBeVisible()
  await page.getByLabel("Dinner name").fill(name)
  await page.getByLabel("Your name").fill(creator)
  await page.getByRole("button", { name: "Create dinner" }).click()
  await expect(page.getByText("Dinner ready")).toBeVisible()
  const code = (await page.locator("p.font-display.text-4xl").innerText()).trim()
  expect(code.length).toBeGreaterThanOrEqual(6)
  await page.getByRole("button", { name: "Continue to dinner" }).click()
  await expect(page.getByRole("heading", { name })).toBeVisible()
  await expect(page.getByText("Dinner", { exact: true }).first()).toBeVisible()
  return code
}

export async function addPeople(page: Page, names: string[]) {
  await page.getByRole("button", { name: "Add people" }).click()
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByText("Add people")).toBeVisible()
  for (const name of names) {
    await sheet.getByPlaceholder("Type a name").fill(name)
    await sheet.getByRole("button", { name: "Add", exact: true }).click()
  }
  await sheet.getByRole("button", { name: "Save names" }).click()
  await expect(sheet).toBeHidden()
  for (const name of names) {
    await expect(page.getByText(name).first()).toBeVisible()
  }
}

export async function startManualCheck(page: Page) {
  const manual = page.getByRole("link", { name: "Enter bill manually" })
  const newCheck = page.getByRole("link", { name: "New check" })
  await expect(manual.or(newCheck).first()).toBeVisible()
  if (await manual.isVisible()) {
    await manual.click()
  } else {
    await newCheck.click()
  }
  await waitForHydration(page)
  const enter = page.getByRole("button", { name: "Enter bill manually" })
  await expect(enter).toBeVisible()
  await enter.click()
  await expect(page.getByLabel("Place")).toBeVisible()
}

export async function addCheckItem(
  page: Page,
  name: string,
  amount: string,
  quantity = 1
) {
  await page.getByPlaceholder("Item").fill(name)
  await page.getByLabel("Quantity").fill(String(quantity))
  await page.getByLabel("Item amount").fill(amount)
  await page.getByRole("button", { name: "Add item" }).click()
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible()
}

export async function assignEqual(page: Page, itemName: string, people: string[]) {
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
  const confirm = page.getByRole("button", { name: "Confirm check" })
  await confirm.scrollIntoViewIfNeeded()
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByText("Confirmed").first()).toBeVisible()
}

export function dinnerNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "Dinner navigation" })
}

export function checksHeading(page: Page): Locator {
  return page.getByRole("heading", { name: "Checks" })
}
