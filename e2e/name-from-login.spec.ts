import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { mkdirSync } from "node:fs"
import path from "node:path"

import {
  openDinnerCreate,
  openLanding,
  signInE2e,
  skipCookieBanner,
  waitForHydration,
} from "./dinner-helpers"

const SHOTS =
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/name-from-login"

async function openCombinedAuth(page: Page, url: string) {
  await skipCookieBanner(page)
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Create account" })
  ).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Create one" })).toHaveCount(0)
  await expect(page.getByText("Already have an account?")).toHaveCount(0)
}

test.describe("Name from login", () => {
  test.beforeAll(() => {
    mkdirSync(SHOTS, { recursive: true })
  })

  test("signed-in dinner Your name prefills from Clerk display name", async ({
    page,
  }) => {
    await signInE2e(page, { displayName: "Walter" })
    await openDinnerCreate(page)
    await expect(page.getByLabel("Your name")).toHaveValue("Walter")
    await page.screenshot({
      path: path.join(SHOTS, "dinner-signed-in-prefill.png"),
      animations: "disabled",
    })
  })

  test("does not overwrite a name they already typed", async ({ page }) => {
    await signInE2e(page, { displayName: "Walter" })
    await openDinnerCreate(page)
    await expect(page.getByLabel("Your name")).toHaveValue("Walter")
    await page.getByLabel("Your name").fill("Ana")
    await page.getByRole("heading", { name: "Split" }).click()
    await expect(page.getByLabel("Your name")).toHaveValue("Ana")
    await page.screenshot({
      path: path.join(SHOTS, "dinner-keep-typed.png"),
      animations: "disabled",
    })
  })

  test("guest can still type a name", async ({ page }) => {
    await openDinnerCreate(page)
    await expect(page.getByLabel("Your name")).toHaveValue("")
    await page.getByLabel("Your name").fill("Ana")
    await expect(page.getByLabel("Your name")).toHaveValue("Ana")
    await page.screenshot({
      path: path.join(SHOTS, "dinner-guest-name.png"),
      animations: "disabled",
    })
  })

  test("signed-in trip Your name prefills from Clerk display name", async ({
    page,
  }) => {
    await signInE2e(page, { displayName: "Walter" })
    await openLanding(page)
    const tripChip = page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Trip" })
    await tripChip.click()
    await expect(tripChip).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByLabel("Your name")).toHaveValue("Walter")
    await page.screenshot({
      path: path.join(SHOTS, "trip-signed-in-prefill.png"),
      animations: "disabled",
    })
  })

  test("sign-in is the combined auth screen", async ({ page }) => {
    await openCombinedAuth(page, "/sign-in?redirect=/")
    await page.screenshot({
      path: path.join(SHOTS, "sign-in-combined.png"),
      animations: "disabled",
    })
  })

  test("sign-up is the same combined auth screen", async ({ page }) => {
    await openCombinedAuth(page, "/sign-up?redirect=/")
    await page.screenshot({
      path: path.join(SHOTS, "sign-up-combined.png"),
      animations: "disabled",
    })
  })
})
