import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"

import { signInE2e, skipCookieBanner, waitForHydration } from "./dinner-helpers"
import { formatDay } from "../src/lib/house-month"

export async function pickHouseMode(page: Page) {
  const houseChip = page
    .getByRole("group", { name: "Mode" })
    .getByRole("button", { name: "House" })
  await expect(async () => {
    await houseChip.click()
    await expect(houseChip).toHaveAttribute("aria-pressed", "true", {
      timeout: 2_000,
    })
  }).toPass({ timeout: 20_000 })
}

export async function createHouse(
  page: Page,
  input: {
    houseName: string
    creator: string
    housemates?: string[]
    userId?: string
  }
): Promise<{ code: string }> {
  await signInE2e(page, {
    userId: input.userId,
    displayName: input.creator,
  })
  await skipCookieBanner(page)
  await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Split" })).toBeVisible()
  await waitForHydration(page)
  await pickHouseMode(page)
  await page.getByLabel("Name your house").fill(input.houseName)
  await page.getByLabel("Your name").fill(input.creator)
  for (const name of input.housemates ?? []) {
    await page.getByLabel("Housemates").fill(name)
    await page.getByLabel("Housemates").press("Enter")
    await expect(
      page.getByRole("button", { name: `Remove ${name}` })
    ).toBeVisible()
  }
  await page.getByRole("button", { name: "Start house" }).click()
  await expect(page.getByRole("heading", { name: "House ready" })).toBeVisible()
  await page.getByRole("button", { name: "Continue to house" }).click()
  await expect(page.getByRole("heading", { name: "House ready" })).toHaveCount(
    0
  )
  await expect(
    page.getByRole("heading", { name: input.houseName })
  ).toBeVisible()
  const code = new URL(page.url()).pathname.split("/")[2] ?? ""
  expect(code.length).toBeGreaterThanOrEqual(6)
  return { code }
}

export async function setHouseMovedIn(
  page: Page,
  names: string[],
  isoDate: string
) {
  await page.getByRole("link", { name: "People" }).click()
  await expect(
    page.getByRole("heading", { name: "People", exact: true })
  ).toBeVisible()
  for (const name of names) {
    await page.getByRole("button", { name: new RegExp(name) }).click()
    await page
      .getByRole("group", { name: "Moved in" })
      .getByLabel("Pick a date")
      .fill(isoDate)
    await expect(
      page.getByText(`Moved in ${formatDay(isoDate)}`, { exact: true })
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("heading", { name: "In this house" })
    ).toHaveCount(0)
  }
  await page.getByRole("link", { name: "Home", exact: true }).click()
}

export async function addHouseCharge(
  page: Page,
  input: { title: string; amountDigits: string; previousMonth?: boolean }
) {
  await page.getByRole("link", { name: "Add charge" }).click()
  await expect(page.getByRole("heading", { name: "Add charge" })).toBeVisible()
  await waitForHydration(page)
  await page.getByLabel("Amount").fill(input.amountDigits)
  await page.getByLabel("What was it?").fill(input.title)
  if (input.previousMonth) {
    await page.getByRole("button", { name: "Previous month" }).click()
  }
  await page.getByRole("button", { name: "Add charge" }).click()
  await expect(page.getByRole("heading", { name: "Add charge" })).toHaveCount(0)
}

export async function openHouseGate(page: Page, code: string) {
  await skipCookieBanner(page)
  await page.goto(`/r/${code}`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  await expect(
    page.getByRole("heading", { name: "Who are you?" })
  ).toBeVisible()
}
