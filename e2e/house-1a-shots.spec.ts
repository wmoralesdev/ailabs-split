import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"

import type { Page } from "@playwright/test"

import { waitForHydration } from "./dinner-helpers"
import { addHouseCharge, createHouse } from "./house-helpers"

const TICKET_PATH = path.resolve(
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/docs/tickets/celeste-imperio.jpg"
)

const SHOTS_DIR =
  process.env.SHOTS_DIR ??
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/house-1a"

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 10_000,
  })
  return page.screenshot({
    path: path.join(SHOTS_DIR, name),
    animations: "disabled",
  })
}

test.describe("House 1A screenshots", () => {
  test.skip(Boolean(process.env.CI), "screenshots are local")
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  for (const scheme of ["light", "dark"] as const) {
    test(`1A screens ${scheme}`, async ({ browser }) => {
      test.setTimeout(120_000)
      const context = await browser.newContext({
        colorScheme: scheme,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      })
      const page = await context.newPage()
      await page.addInitScript((value) => {
        window.localStorage.setItem("split-theme", value)
      }, scheme)

      const stamp = `${scheme}-${Date.now().toString(36)}`
      const houseName = scheme === "light" ? "Casa Escalón" : "Casa Las Palmas"
      await createHouse(page, {
        houseName,
        creator: "Walter",
        housemates: ["Ana"],
        userId: `user_e2e_shots_${stamp}`,
      })
      await expect(page.getByText("No charges yet")).toBeVisible()
      await shot(page, `${scheme}-empty-house.png`)

      await page.getByRole("link", { name: "Add charge" }).click()
      await expect(
        page.getByRole("heading", { name: "Add charge" })
      ).toBeVisible()
      await waitForHydration(page)
      await shot(page, `${scheme}-add-charge.png`)

      if (existsSync(TICKET_PATH)) {
        await page
          .getByTestId("ticket-gallery-input")
          .setInputFiles(TICKET_PATH)
        await expect(page.getByLabel("What was it?")).toHaveValue("CAESS", {
          timeout: 20_000,
        })
        await shot(page, `${scheme}-receipt-scan.png`)
      }

      await page.getByRole("link", { name: "Home", exact: true }).click()
      await expect(page.getByRole("heading", { name: houseName })).toBeVisible()
      await addHouseCharge(page, { title: "Rent", amountDigits: "28400" })
      await expect(page.getByText("You get back $142.00")).toBeVisible()

      await page.getByRole("link", { name: "People" }).click()
      await expect(
        page.getByRole("heading", { name: "People", exact: true })
      ).toBeVisible()
      await expect(page.getByText("Ana owes $142.00")).toBeVisible()
      await shot(page, `${scheme}-people.png`)

      await page.getByRole("link", { name: "Settle", exact: true }).click()
      const settleYours = page.getByRole("region", { name: "Yours" })
      await expect(settleYours.getByText("Ana pays you")).toBeVisible()
      await expect(
        settleYours.getByText("$142.00", { exact: true })
      ).toBeVisible()
      await page.getByRole("button", { name: "Ana paid me" }).click()
      await expect(page.getByLabel("How much?")).toBeVisible()
      await page.getByLabel("How much?").fill("10000")
      await expect(page.getByText("Suggested $142.00")).toBeVisible()
      await shot(page, `${scheme}-settle-partial.png`)
      await page.getByRole("button", { name: "Continue" }).click()
      await page.getByRole("button", { name: "Skip" }).click()
      await expect(
        settleYours.getByText("$42.00", { exact: true })
      ).toBeVisible()

      await page.getByRole("link", { name: "Home", exact: true }).click()
      await page.getByRole("link", { name: "Recurring" }).click()
      await expect(
        page.getByRole("heading", { name: "Recurring", exact: true })
      ).toBeVisible()
      await page.getByRole("button", { name: "Add recurring" }).click()
      await expect(
        page.getByRole("heading", { name: "Add recurring" })
      ).toBeVisible()
      await page.getByLabel("What was it?").fill("Internet")
      await page.getByRole("button", { name: "Internet", exact: true }).click()
      await page.getByLabel("Amount").fill("4000")
      await page.getByRole("button", { name: "Save" }).click()
      await expect(page.getByText("Internet", { exact: true })).toBeVisible()
      await page.getByRole("link", { name: "Home", exact: true }).click()
      await expect(
        page.getByRole("heading", { name: "Due this month" })
      ).toBeVisible()
      await shot(page, `${scheme}-due-this-month.png`)
      await page.getByRole("button", { name: /^Internet/ }).click()
      await expect(
        page.getByRole("button", { name: "Edit first" })
      ).toBeVisible()
      await shot(page, `${scheme}-due-sheet.png`)
      await page.keyboard.press("Escape")

      await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
      await waitForHydration(page)
      const yours = page.getByRole("region", { name: "Your bills and trips" })
      await expect(
        yours.getByRole("button", { name: `Open ${houseName}` })
      ).toBeVisible()
      for (let i = 0; i < 8; i++) {
        const box = await yours.boundingBox()
        if (!box || box.y <= 20) break
        await page.evaluate((dy) => window.scrollBy(0, dy), box.y - 16)
      }
      await shot(page, `${scheme}-home-row.png`)

      await context.close()
    })
  }
})
