import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import {
  addPeople,
  confirmCheck,
  createDinner,
  waitForHydration,
} from "./dinner-helpers"

const TICKET_PATH = path.resolve(
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/docs/tickets/celeste-imperio.jpg"
)
const SHOTS_DIR = process.env.SHOTS_DIR

/** Verification shots for the one-bill dinner, light and dark. Runs only with SHOTS_DIR set. */
for (const scheme of ["light", "dark"] as const) {
  test(`one-bill screens, ${scheme}`, async ({ browser }) => {
    test.skip(!SHOTS_DIR, "set SHOTS_DIR to capture verification shots")
    test.skip(!existsSync(TICKET_PATH), "ticket photo is missing")
    test.skip(
      !process.env.OPENAI_API_KEY && process.env.OCR_FIXTURE !== "1",
      "needs OPENAI_API_KEY or OCR_FIXTURE=1"
    )
    const dir = SHOTS_DIR!
    mkdirSync(dir, { recursive: true })
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    const shot = (name: string) =>
      page.screenshot({ path: path.join(dir, `${scheme}-${name}.png`) })

    await createDinner(page, "Ana")
    await shot("01-dinner-home-no-bill")

    await page.getByTestId("ticket-gallery-input").setInputFiles(TICKET_PATH)
    await expect(
      page.getByRole("heading", { name: "Check the ticket" })
    ).toBeVisible({ timeout: 40_000 })
    await waitForHydration(page)
    await shot("02-review-lines")

    await page
      .getByRole("button", { name: /^What is .+\? Item$/ })
      .first()
      .click()
    await expect(page.getByRole("radiogroup")).toBeVisible()
    await page.waitForTimeout(300)
    await shot("03-line-kind-picker")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("radiogroup")).toBeHidden()

    await page.getByRole("button", { name: "Continue to assign" }).click()
    await addPeople(page, ["Ben", "Cam"])
    await page.evaluate(() => window.scrollTo(0, 0))
    await shot("04-bill-people")

    const first = page
      .getByRole("listitem")
      .filter({ has: page.getByText("Who had this?") })
      .first()
    await first.getByRole("button", { name: "Ben", exact: true }).click()
    await first.getByRole("button", { name: "Cam", exact: true }).click()
    await page.getByRole("heading", { name: "Items" }).scrollIntoViewIfNeeded()
    await shot("05-bill-items-chips")

    await page.getByRole("button", { name: "Assign rest to me" }).click()
    await page.getByText("Total", { exact: true }).scrollIntoViewIfNeeded()
    await shot("06-bill-totals")

    await confirmCheck(page)
    await shot("07-dinner-home-one-bill")
    await context.close()
  })
}
