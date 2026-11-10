import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import { createDinner, openBill } from "./dinner-helpers"

const SHOTS_DIR = "/cursor/stores/self/media/unit-price-qty"

function shot(
  page: { screenshot: (opts: { path: string }) => Promise<unknown> },
  name: string
) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  return page.screenshot({ path: path.join(SHOTS_DIR, name) })
}

test.describe.configure({ mode: "serial" })

test("typed price is the unit; quantity multiplies it", async ({ page }) => {
  await createDinner(page, "Ana")
  await openBill(page)

  await page.getByLabel("Item", { exact: true }).fill("Pupusa Frijol")
  await page.getByLabel("Qty", { exact: true }).fill("3")
  await page.getByLabel("Price", { exact: true }).fill("1.40")
  const lineHint = page.getByText("$4.20 on the bill")
  await expect(lineHint).toBeVisible()
  await lineHint.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "nearest" })
  })
  await shot(page, "add-form.png")

  await page.getByRole("button", { name: "Add item" }).click()
  const line = page.getByRole("button", { name: /Pupusa Frijol/ })
  await expect(line).toBeVisible()
  await expect(line).toContainText("$4.20")
  await expect(line).not.toContainText("$1.40")
  await expect(line).not.toContainText("3 ×")
  await expect(line).not.toContainText("3x")
  await expect(page.getByLabel("Qty 3")).toBeVisible()
  await shot(page, "line-on-bill.png")

  await line.click()
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByText("Split item")).toBeVisible()
  await expect(sheet).toHaveCSS("opacity", "1")
  await expect(sheet.getByText("$4.20").first()).toBeVisible()
  await sheet.locator("summary").filter({ hasText: "Edit item" }).click()
  await expect(sheet.getByLabel("Price")).toBeVisible()
  await expect(sheet.getByLabel("Price")).toHaveValue("1.40")
  await expect(sheet.getByText("$4.20 on the bill")).toBeVisible()
  await shot(page, "split-sheet.png")

  for (const name of ["add-form.png", "line-on-bill.png", "split-sheet.png"]) {
    expect(existsSync(path.join(SHOTS_DIR, name)), name).toBe(true)
  }
})
