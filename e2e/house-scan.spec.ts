import { existsSync } from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import { createHouse } from "./house-helpers"
import { waitForHydration } from "./dinner-helpers"
import { formatMonth, monthKey } from "../src/lib/house-month"

const TICKET_PATH = path.resolve(
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/docs/tickets/celeste-imperio.jpg"
)

async function addVariablePower(page: Page) {
  await page.getByRole("link", { name: "Recurring" }).click()
  await expect(
    page.getByRole("heading", { name: "Recurring", exact: true })
  ).toBeVisible()
  await page.getByRole("button", { name: "Add recurring" }).click()
  await expect(
    page.getByRole("heading", { name: "Add recurring" })
  ).toBeVisible()
  await page.getByRole("tab", { name: "Variable" }).click()
  await page.getByLabel("What was it?").fill("Power")
  await page.getByRole("button", { name: "Utilities", exact: true }).click()
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Power", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Home", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Due this month" })
  ).toBeVisible()
}

test.describe("House receipt scan", () => {
  test.skip(!existsSync(TICKET_PATH), "ticket photo is missing")

  test("a utility bill fills the matching due and saves the photo", async ({
    page,
  }) => {
    await createHouse(page, {
      houseName: "Casa Scan Utility",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await addVariablePower(page)
    await page.getByRole("link", { name: "Scan a receipt" }).click()
    await expect(
      page.getByRole("heading", { name: "Add charge" })
    ).toBeVisible()
    await waitForHydration(page)
    await page.getByTestId("ticket-gallery-input").setInputFiles(TICKET_PATH)
    await expect(page.getByLabel("What was it?")).toHaveValue("CAESS", {
      timeout: 20_000,
    })
    await expect(page.getByTestId("house-scan-extra-note")).toContainText(
      "previous balance of $8.50"
    )
    await expect(page.getByTestId("house-scan-due-note")).toContainText(
      `This fills Power for ${formatMonth(monthKey())}`
    )
    await expect(
      page.getByText("Receipt photo will be saved with this charge.")
    ).toBeVisible()
    await page.getByRole("button", { name: "Add charge" }).click()
    await expect(page.getByRole("heading", { name: "Add charge" })).toHaveCount(
      0
    )
    await expect(page.getByRole("button", { name: /CAESS/ })).toBeVisible()
    await expect(page.getByRole("button", { name: "Add amount" })).toHaveCount(
      0
    )
    await page.getByRole("button", { name: /CAESS/ }).click()
    await expect(page.getByRole("button", { name: "View photo" })).toBeVisible()
    await page.getByRole("button", { name: "View photo" }).click()
    await expect(page.getByTestId("house-receipt-full")).toBeVisible()
  })

  test("a grocery ticket fills title and total and does not save the photo", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ "x-ocr-fixture": "grocery" })
    await createHouse(page, {
      houseName: "Casa Scan Grocery",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await page.getByRole("link", { name: "Scan a receipt" }).click()
    await expect(
      page.getByRole("heading", { name: "Add charge" })
    ).toBeVisible()
    await waitForHydration(page)
    await page.getByTestId("ticket-gallery-input").setInputFiles(TICKET_PATH)
    await expect(page.getByLabel("What was it?")).toHaveValue(
      "Super Selectos",
      { timeout: 20_000 }
    )
    await expect(
      page.getByText(
        "Grocery tickets keep the title and total. The photo is not saved."
      )
    ).toBeVisible()
    await page.getByRole("button", { name: "Add charge" }).click()
    await expect(page.getByRole("heading", { name: "Add charge" })).toHaveCount(
      0
    )
    await expect(
      page.getByRole("button", { name: /Super Selectos/ })
    ).toBeVisible()
    await page.getByRole("button", { name: /Super Selectos/ }).click()
    await expect(page.getByRole("button", { name: "View photo" })).toHaveCount(
      0
    )
  })
})
