import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import {
  addCheckItem,
  billNameField,
  createDinner,
  fillBillName,
  openBill,
} from "./dinner-helpers"

const SHOTS = "/cursor/stores/self/media/edit-dinner-name"
const PLACE_SHOTS = "/cursor/stores/self/media/bill-title-place"

const SHOT_FILES = [
  "home-before.png",
  "rename-sheet.png",
  "home-renamed.png",
] as const

test.describe("edit dinner name", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  test("the bill has one name; home and the editor stay in sync", async ({
    page,
  }) => {
    mkdirSync(SHOTS, { recursive: true })
    mkdirSync(PLACE_SHOTS, { recursive: true })
    const shot = (dir: string, name: string) =>
      page.screenshot({
        path: path.join(dir, name),
        animations: "disabled",
      })

    const { name: original } = await createDinner(page, "Walter")
    await expect(
      page.getByRole("heading", { level: 1, name: original })
    ).toBeVisible()
    await expect(page.locator("select")).toHaveCount(0)
    await shot(SHOTS, "home-before.png")

    await page.getByRole("button", { name: `Rename ${original}` }).click()
    const sheet = page.getByRole("dialog")
    await expect(
      sheet.getByRole("heading", { name: "Bill name" })
    ).toBeVisible()
    await expect(sheet.getByText("What to call this bill.")).toBeVisible()
    await expect(sheet.getByText("Place on the bill is separate")).toHaveCount(
      0
    )
    const dinnerField = sheet.getByRole("textbox", { name: "Bill" })
    await expect(dinnerField).toHaveValue(original)
    await dinnerField.fill("Tuesday lunch")
    await shot(SHOTS, "rename-sheet.png")
    await sheet.getByRole("button", { name: "Save name" }).click()
    await expect(sheet).toBeHidden()
    await expect(
      page.getByRole("heading", { level: 1, name: "Tuesday lunch" })
    ).toBeVisible()
    await expect(page.getByText("Bill renamed")).toBeVisible()
    await shot(SHOTS, "home-renamed.png")
    await expect(page.getByText("Bill renamed")).toBeHidden()

    await openBill(page)
    const billField = billNameField(page)
    await expect(billField).toHaveValue("Tuesday lunch")
    await expect(page.getByLabel("Place")).toHaveCount(0)
    await fillBillName(page, "Amazon")
    await expect(page.getByText("Bill renamed")).toBeVisible()
    await expect(page.getByText("Bill renamed")).toBeHidden()
    await addCheckItem(page, "Coffee", "4.50")
    await page
      .getByRole("button", { name: "Back", exact: true })
      .scrollIntoViewIfNeeded()
    await shot(PLACE_SHOTS, "editor.png")
    await page.getByRole("button", { name: "Save draft for later" }).click()
    await expect(page.getByText("Draft saved")).toBeVisible()

    await page.getByRole("button", { name: "Back", exact: true }).click()
    await expect(
      page.getByRole("heading", { level: 1, name: "Amazon" })
    ).toBeVisible()
    await expect(page.getByText("Walter paid")).toBeVisible()
    await expect(page.getByText("Draft saved")).toBeHidden()
    await expect(page.getByText("Tuesday lunch")).toHaveCount(0)
    await shot(PLACE_SHOTS, "home.png")

    for (const file of SHOT_FILES) {
      expect(existsSync(path.join(SHOTS, file)), file).toBe(true)
    }
    expect(existsSync(path.join(PLACE_SHOTS, "editor.png"))).toBe(true)
    expect(existsSync(path.join(PLACE_SHOTS, "home.png"))).toBe(true)
  })
})
