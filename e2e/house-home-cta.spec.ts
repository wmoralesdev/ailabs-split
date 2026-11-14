import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"

import { signInE2e, skipCookieBanner, waitForHydration } from "./dinner-helpers"
import { createHouse, pickHouseMode } from "./house-helpers"

const SHOTS_DIR =
  process.env.SHOTS_DIR ??
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/house-home-cta"

async function openHouseTab(page: Page) {
  await skipCookieBanner(page)
  await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Split" })).toBeVisible()
  await waitForHydration(page)
  await pickHouseMode(page)
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
    timeout: 10_000,
  })
  const dest = path.join(SHOTS_DIR, name)
  const tmp = path.join(os.tmpdir(), `house-home-cta-${name}`)
  await page.screenshot({ path: tmp, animations: "disabled" })
  try {
    copyFileSync(tmp, dest)
  } catch (error) {
    if (!existsSync(dest)) throw error
  }
}

test.describe("House home CTA", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  test("empty House tab keeps create as the filled CTA", async ({ page }) => {
    await signInE2e(page, { displayName: "Walter" })
    await openHouseTab(page)

    const startHouse = page.getByRole("button", { name: "Start house" })
    await expect(startHouse).toBeVisible()
    await expect(startHouse).toHaveClass(/cta-lg/)
    await expect(page.getByRole("link", { name: /^Open / })).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Start another house" })
    ).toHaveCount(0)
    await expect(page.getByLabel("Name your house")).toBeVisible()
  })

  test("one house: filled CTA opens it and create is a text path", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36)
    const houseName = `Casa CTA ${stamp}`
    await createHouse(page, {
      houseName,
      creator: "Walter",
      housemates: ["Ana"],
      userId: `user_e2e_house_cta_${stamp}`,
    })
    await page.getByRole("link", { name: "Split home" }).click()
    await expect(page.getByRole("heading", { name: "Split" })).toBeVisible()
    await waitForHydration(page)
    await pickHouseMode(page)

    const openHouse = page.getByRole("link", { name: `Open ${houseName}` })
    await expect(openHouse).toBeVisible()
    await expect(openHouse).toHaveClass(/split-cta/)
    await expect(page.getByRole("button", { name: "Start house" })).toHaveCount(
      0
    )
    const startAnother = page.getByRole("button", {
      name: "Start another house",
    })
    await expect(startAnother).toBeVisible()
    await expect(startAnother).toHaveClass(/text-action/)
    await expect(page.getByLabel("Name your house")).toHaveCount(0)

    const yours = page.getByRole("region", { name: "Your bills and trips" })
    await expect(yours.getByText(houseName)).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Recent trips" }).getByText(houseName)
    ).toHaveCount(0)

    await startAnother.click()
    await expect(page.getByLabel("Name your house")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Start house" })
    ).toBeVisible()
    await expect(openHouse).toHaveCount(0)
    await page
      .getByRole("tabpanel")
      .getByRole("button", { name: `Open ${houseName}` })
      .click()
    await expect(page.getByRole("heading", { name: houseName })).toBeVisible()
    await expect(page.getByText("House · 2 housemates")).toBeVisible()

    await page.getByRole("link", { name: "Split home" }).click()
    await waitForHydration(page)
    await pickHouseMode(page)
    await openHouse.click()
    await expect(page.getByRole("heading", { name: houseName })).toBeVisible()
  })

  for (const scheme of ["light", "dark"] as const) {
    test(`${scheme} screenshots`, async ({ browser }) => {
      test.setTimeout(90_000)
      const context = await browser.newContext({
        colorScheme: scheme,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      })
      const page = await context.newPage()
      await page.addInitScript((value) => {
        window.localStorage.setItem("split-theme", value)
      }, scheme)

      await signInE2e(page, {
        displayName: "Walter",
        userId: `user_e2e_house_cta_shot_empty_${scheme}_${Date.now().toString(36)}`,
      })
      await openHouseTab(page)
      await expect(
        page.getByRole("button", { name: "Start house" })
      ).toBeVisible()
      await shot(page, `${scheme}-empty.png`)

      const stamp = `${scheme}-${Date.now().toString(36)}`
      const houseName = scheme === "light" ? "Casa Escalón" : "Casa Las Palmas"
      await createHouse(page, {
        houseName,
        creator: "Walter",
        housemates: ["Ana"],
        userId: `user_e2e_house_cta_shot_${stamp}`,
      })
      await page.getByRole("link", { name: "Split home" }).click()
      await expect(page.getByRole("heading", { name: "Split" })).toBeVisible()
      await waitForHydration(page)
      await pickHouseMode(page)
      await expect(
        page.getByRole("link", { name: `Open ${houseName}` })
      ).toBeVisible()
      const startAnother = page.getByRole("button", {
        name: "Start another house",
      })
      await expect(startAnother).toBeVisible()
      await shot(page, `${scheme}-one-house.png`)

      await startAnother.click()
      await expect(page.getByLabel("Name your house")).toBeVisible()
      await expect(
        page
          .getByRole("tabpanel")
          .getByRole("button", { name: `Open ${houseName}` })
      ).toBeVisible()
      await shot(page, `${scheme}-start-another.png`)
      await context.close()
    })
  }
})
