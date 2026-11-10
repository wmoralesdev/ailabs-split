import { expect, test } from "@playwright/test"
import { mkdirSync } from "node:fs"
import path from "node:path"

import {
  createDinner,
  openDinnerCreate,
  signInE2e,
  waitForHydration,
} from "./dinner-helpers"

const SHOTS =
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/clerk-auth"

test.describe("Clerk auth", () => {
  test.beforeAll(() => {
    mkdirSync(SHOTS, { recursive: true })
  })

  test("cookie banner Accept", async ({ page }) => {
    await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    const banner = page.getByRole("region", { name: "Cookie notice" })
    await expect(banner).toBeVisible()
    await expect(
      page.getByText(/necessary cookies to keep you signed in/i)
    ).toBeVisible()
    await expect(banner.getByRole("button", { name: "Accept" })).toBeVisible()
    await expect(banner.getByRole("button", { name: "Reject" })).toHaveCount(0)
    await page.screenshot({
      path: path.join(SHOTS, "cookie-banner.png"),
      animations: "disabled",
    })
    await banner.getByRole("button", { name: "Accept" }).click()
    await expect(banner).toHaveCount(0)
  })

  test("scan ticket while signed out goes to sign-in", async ({ page }) => {
    await openDinnerCreate(page)
    await page.getByLabel("Your name").fill("Ana")
    await page.getByRole("button", { name: "Scan ticket" }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
    await page.screenshot({
      path: path.join(SHOTS, "scan-sign-in-gate.png"),
      animations: "disabled",
    })
  })

  test("signed-in home lists yours", async ({ page }) => {
    await signInE2e(page)
    const { name } = await createDinner(page, "Ana")
    await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    const yours = page.getByRole("region", { name: "Your dinners and trips" })
    await expect(yours).toBeVisible()
    await expect(yours.getByText(name)).toBeVisible()
    await expect(page.getByText("Signed in")).toBeVisible()
    await page.screenshot({
      path: path.join(SHOTS, "signed-in-home.png"),
      animations: "disabled",
    })
  })
})
