import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import { skipCookieBanner, waitForHydration } from "./dinner-helpers"

const SHOTS = "/cursor/stores/self/media/ailabs-wordmark"

const SHOT_FILES = ["landing-mobile.png", "landing-desktop.png"] as const

async function openLanding(page: Page) {
  await skipCookieBanner(page)
  await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Split" })).toBeVisible()
  await waitForHydration(page)
  await page.evaluate(async () => {
    await document.fonts.load('400 16px "Plus Jakarta Sans"')
    await document.fonts.ready
  })
  const lockup = page.getByRole("img", { name: "Ai Labs" })
  await expect(lockup).toBeVisible()
  await expect(lockup.locator("img:visible")).toHaveCount(1)
}

async function assertLockup(page: Page) {
  const lockup = page.getByRole("img", { name: "Ai Labs" })
  await expect(lockup.getByText("Ai", { exact: true })).toBeVisible()
  await expect(lockup.getByText("Labs", { exact: true })).toBeVisible()
  await expect(lockup.getByText("AI", { exact: true })).toHaveCount(0)

  const ai = lockup.getByText("Ai", { exact: true })
  const labs = lockup.getByText("Labs", { exact: true })

  const aiStyle = await ai.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      color: s.color,
      family: s.fontFamily,
      weight: s.fontWeight,
      synthesis: s.fontSynthesis,
    }
  })
  const labsStyle = await labs.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      color: s.color,
      family: s.fontFamily,
      weight: s.fontWeight,
      synthesis: s.fontSynthesis,
    }
  })

  expect(aiStyle.family).toMatch(/^["']?Plus Jakarta Sans["']?/)
  expect(labsStyle.family).toMatch(/^["']?Plus Jakarta Sans["']?/)
  expect(aiStyle.family).not.toMatch(/Variable/i)
  expect(Number(aiStyle.weight)).toBe(400)
  expect(Number(labsStyle.weight)).toBe(400)
  expect(aiStyle.synthesis).toMatch(/none/)
  const regularLoaded = await page.evaluate(() =>
    document.fonts.check('400 16px "Plus Jakarta Sans"')
  )
  expect(regularLoaded).toBe(true)
  expect(aiStyle.color).toBe("rgb(139, 123, 199)")
  expect(labsStyle.color).toBe("rgb(48, 48, 48)")

  const split = page.getByRole("heading", { name: "Split", exact: true })
  await expect(split).toBeVisible()
  await expect(split.locator("img, svg")).toHaveCount(0)
}

test.describe("Ai Labs lockup", () => {
  test.afterAll(() => {
    for (const file of SHOT_FILES) {
      expect(existsSync(path.join(SHOTS, file)), file).toBe(true)
    }
  })

  test.describe("mobile", () => {
    test.use({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    })

    test("landing header lockup", async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      await openLanding(page)
      await assertLockup(page)
      await page.screenshot({
        path: path.join(SHOTS, "landing-mobile.png"),
        animations: "disabled",
      })
      await page
        .locator("header")
        .first()
        .screenshot({
          path: path.join(SHOTS, "header-mobile.png"),
          animations: "disabled",
        })

      await page.goto("/sign-in", { waitUntil: "domcontentloaded" })
      await waitForHydration(page)
      await expect(page.getByRole("img", { name: "Ai Labs" })).toBeVisible()
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
    })
  })

  test.describe("mobile dark", () => {
    test.use({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    })

    test("lockup inks on dark ground", async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      await openLanding(page)
      const lockup = page.getByRole("img", { name: "Ai Labs" })
      const labs = lockup.getByText("Labs", { exact: true })
      const labsColor = await labs.evaluate((el) => getComputedStyle(el).color)
      expect(labsColor).toBe("rgb(237, 237, 237)")
      await expect(
        lockup.locator('img[src="/brand/ailabs-iso-light.svg"]')
      ).toBeVisible()
      await page.screenshot({
        path: path.join(SHOTS, "landing-mobile-dark.png"),
        animations: "disabled",
      })
    })
  })

  test.describe("desktop", () => {
    test.use({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    })

    test("landing header lockup", async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true })
      await openLanding(page)
      await assertLockup(page)
      await page.screenshot({
        path: path.join(SHOTS, "landing-desktop.png"),
        animations: "disabled",
      })
      await page
        .locator("header")
        .first()
        .screenshot({
          path: path.join(SHOTS, "header-desktop.png"),
          animations: "disabled",
        })
    })
  })
})
