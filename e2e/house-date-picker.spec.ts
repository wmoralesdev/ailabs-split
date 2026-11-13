import { mkdirSync } from "node:fs"
import path from "node:path"

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import { signInE2e, skipCookieBanner, waitForHydration } from "./dinner-helpers"
import { createHouse, pickHouseMode } from "./house-helpers"

const SHOTS_DIR =
  process.env.SHOTS_DIR ??
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/house-date-picker"

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  return page.screenshot({
    path: path.join(SHOTS_DIR, name),
    animations: "disabled",
  })
}

async function openHouseCreate(page: Page, scheme: "light" | "dark") {
  await page.addInitScript((value) => {
    window.localStorage.setItem("split-theme", value)
  }, scheme)
  await signInE2e(page, {
    displayName: "Walter",
    userId: `user_e2e_date_${scheme}_${Date.now().toString(36)}`,
  })
  await skipCookieBanner(page)
  await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Split" })).toBeVisible()
  await waitForHydration(page)
  await pickHouseMode(page)
  await page.getByRole("button", { name: "Change date" }).click()
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible()
}

test.describe("Taste date picker", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  test("create-house Moved in is typed, not native, with the calendar open", async ({
    page,
  }) => {
    await openHouseCreate(page, "light")
    const movedIn = page.getByRole("group", { name: "Moved in" })
    await expect(movedIn.locator('input[type="date"]')).toHaveCount(0)
    await expect(movedIn.getByPlaceholder("MM/DD/YYYY")).toBeVisible()
    await expect(
      movedIn.getByRole("button", { name: "Today" })
    ).toHaveAttribute("aria-pressed", "true")
    await shot(page, "light-moved-in-today.png")

    await movedIn.getByRole("button", { name: "Yesterday" }).click()
    await expect(
      movedIn.getByRole("button", { name: "Yesterday" })
    ).toHaveAttribute("aria-pressed", "true")
    await shot(page, "light-moved-in-yesterday.png")

    const field = movedIn.getByRole("textbox", { name: "Pick a date" })
    await field.click()
    await expect(page.locator("[data-slot=calendar]")).toBeVisible()
    await field.fill("12/25/2026")
    await expect(field).toHaveValue("12/25/2026")
    await expect(page.locator("[data-slot=calendar]")).toBeVisible()
    await shot(page, "light-moved-in-typed.png")

    await page.locator('[data-slot=calendar] [data-day="12/20/2026"]').click()
    await expect(page.locator("[data-slot=calendar]")).toBeVisible()
    await expect(field).toHaveValue("12/20/2026")
    await shot(page, "light-moved-in-calendar.png")
  })

  test("create-house Moved in in dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await openHouseCreate(page, "dark")
    const movedIn = page.getByRole("group", { name: "Moved in" })
    await shot(page, "dark-moved-in-today.png")
    await movedIn.getByRole("button", { name: "Yesterday" }).click()
    await shot(page, "dark-moved-in-yesterday.png")
    const field = movedIn.getByRole("textbox", { name: "Pick a date" })
    await field.click()
    await expect(page.locator("[data-slot=calendar]")).toBeVisible()
    await field.fill("12/25/2026")
    await expect(page.locator("[data-slot=calendar]")).toBeVisible()
    await shot(page, "dark-moved-in-typed.png")
    await page.locator('[data-slot=calendar] [data-day="12/20/2026"]').click()
    await expect(field).toHaveValue("12/20/2026")
    await expect(page.locator("[data-slot=calendar]")).toBeVisible()
    await shot(page, "dark-moved-in-calendar.png")
  })

  test("recurring Due day and Starts can be typed", async ({ page }) => {
    await createHouse(page, {
      houseName: "Casa Date Recurring",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await page.getByRole("link", { name: "Recurring" }).click()
    await page.getByRole("button", { name: "Add recurring" }).click()
    await expect(
      page.getByRole("heading", { name: "Add recurring" })
    ).toBeVisible()
    await expect(page.locator('input[type="date"]')).toHaveCount(0)

    const dueDay = page.getByRole("textbox", { name: "Due day" })
    await dueDay.scrollIntoViewIfNeeded()
    await dueDay.click()
    await expect(
      page.getByRole("button", { name: "15", exact: true })
    ).toBeVisible()
    await dueDay.fill("15")
    await expect(dueDay).toHaveValue("15")
    await shot(page, "light-due-day-typed.png")

    const starts = page.getByRole("textbox", { name: "Starts" })
    await starts.scrollIntoViewIfNeeded()
    await starts.click()
    await expect(page.getByRole("button", { name: "Jun" })).toBeVisible()
    await starts.fill("Jun 2027")
    await expect(starts).toHaveValue("Jun 2027")
    await shot(page, "light-starts-typed.png")
  })

  test("recurring Due day and Starts in dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await page.addInitScript(() => {
      window.localStorage.setItem("split-theme", "dark")
    })
    await createHouse(page, {
      houseName: "Casa Date Recurring Dark",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await page.getByRole("link", { name: "Recurring" }).click()
    await page.getByRole("button", { name: "Add recurring" }).click()
    const dueDay = page.getByRole("textbox", { name: "Due day" })
    await dueDay.scrollIntoViewIfNeeded()
    await dueDay.click()
    await dueDay.fill("15")
    await expect(
      page.getByRole("button", { name: "15", exact: true })
    ).toBeVisible()
    await shot(page, "dark-due-day-typed.png")
    const starts = page.getByRole("textbox", { name: "Starts" })
    await starts.scrollIntoViewIfNeeded()
    await starts.click()
    await starts.fill("Jun 2027")
    await expect(page.getByRole("button", { name: "Jun" })).toBeVisible()
    await shot(page, "dark-starts-typed.png")
  })
})
