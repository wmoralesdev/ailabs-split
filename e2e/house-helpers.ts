import { expect } from "@playwright/test"
import type { Page } from "@playwright/test"

import { signInE2e, skipCookieBanner, waitForHydration } from "./dinner-helpers"

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
  await expect(page.getByRole("heading", { name: "House ready" })).toHaveCount(0)
  await expect(
    page.getByRole("heading", { name: input.houseName })
  ).toBeVisible()
  const code = new URL(page.url()).pathname.split("/")[2] ?? ""
  expect(code.length).toBeGreaterThanOrEqual(6)
  return { code }
}

export async function openHouseGate(page: Page, code: string) {
  await skipCookieBanner(page)
  await page.goto(`/r/${code}`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  await expect(
    page.getByRole("heading", { name: "Who are you?" })
  ).toBeVisible()
}
