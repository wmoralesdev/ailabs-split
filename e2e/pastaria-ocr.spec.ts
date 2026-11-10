import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import { openDinnerCreate, signInE2e, waitForHydration } from "./dinner-helpers"

const TICKET_PATH = path.resolve(
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/pastaria-ocr/pastaria-ticket.jpg"
)
const SHOTS =
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/pastaria-ocr"

test.describe("Pastaria OCR keeps last extras", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "x-ocr-fixture": "pastaria" },
  })

  test("review lists pan almuerzo, $0 AYCE, and printed propina", async ({
    page,
  }) => {
    test.skip(!existsSync(TICKET_PATH), "Pastaria ticket photo is missing")
    mkdirSync(SHOTS, { recursive: true })

    await signInE2e(page)
    await openDinnerCreate(page)
    await page.getByLabel("Your name").fill("Ana")
    await page.getByTestId("ticket-gallery-input").setInputFiles(TICKET_PATH)

    await expect(
      page.getByRole("heading", { name: "Check the ticket" })
    ).toBeVisible({ timeout: 40_000 })
    await waitForHydration(page)

    await expect(page.getByLabel("Place")).toHaveValue(/pastaria/i)
    await expect(page.getByText(/insalata caesar/i).first()).toBeVisible()
    await expect(page.getByText("$0.00").first()).toBeVisible()
    await page
      .getByText(/pastaria mealxl/i)
      .first()
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      path: path.join(SHOTS, "review-top.png"),
      animations: "disabled",
    })

    const pan = page.getByText(/pan almuerzo cena/i).first()
    await pan.scrollIntoViewIfNeeded()
    await expect(pan).toBeVisible()
    await expect(page.getByText("$1.00").first()).toBeVisible()
    await expect(page.getByText(/past 4 formaggi/i).first()).toBeVisible()
    await page.screenshot({
      path: path.join(SHOTS, "review-pan.png"),
      animations: "disabled",
    })

    const printed = page.getByRole("region", { name: "Printed totals" })
    await printed.scrollIntoViewIfNeeded()
    await expect(printed.getByText("Tip")).toBeVisible()
    await expect(printed.getByText("$5.67")).toBeVisible()
    await expect(printed.getByText("$56.65")).toBeVisible()
    await expect(printed.getByText("$62.32")).toBeVisible()
    await page.screenshot({
      path: path.join(SHOTS, "review-footer.png"),
      animations: "disabled",
    })
  })
})
