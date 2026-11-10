import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import { addCheckItem, createDinner, openBill } from "./dinner-helpers"

const SHOTS = "/cursor/stores/self/media/edit-dinner-name"

const SHOT_FILES = [
  "home-before.png",
  "rename-sheet.png",
  "home-renamed.png",
  "place-on-bill.png",
  "home-place-separate.png",
] as const

test.describe("edit dinner name", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  test("anyone in the dinner can rename the title; place stays its own field", async ({
    page,
  }) => {
    mkdirSync(SHOTS, { recursive: true })
    const shot = (name: (typeof SHOT_FILES)[number]) =>
      page.screenshot({
        path: path.join(SHOTS, name),
        animations: "disabled",
      })

    const { name: original } = await createDinner(page, "Walter")
    await expect(
      page.getByRole("heading", { level: 1, name: original })
    ).toBeVisible()
    await expect(page.locator("select")).toHaveCount(0)
    await shot("home-before.png")

    await page.getByRole("button", { name: `Rename ${original}` }).click()
    const sheet = page.getByRole("dialog")
    await expect(
      sheet.getByRole("heading", { name: "Dinner name" })
    ).toBeVisible()
    const dinnerField = sheet.getByRole("textbox", { name: "Dinner" })
    await expect(dinnerField).toHaveValue(original)
    await dinnerField.fill("Tuesday lunch")
    await shot("rename-sheet.png")
    await sheet.getByRole("button", { name: "Save name" }).click()
    await expect(sheet).toBeHidden()
    await expect(
      page.getByRole("heading", { level: 1, name: "Tuesday lunch" })
    ).toBeVisible()
    await expect(page.getByText("Dinner renamed")).toBeVisible()
    await shot("home-renamed.png")
    await expect(page.getByText("Dinner renamed")).toBeHidden()

    await openBill(page)
    const billDinner = page.getByRole("textbox", { name: "Dinner" })
    await expect(billDinner).toHaveValue("Tuesday lunch")
    await expect(page.getByLabel("Place")).toBeVisible()
    await page.getByLabel("Place").fill("Amazon")
    await billDinner.scrollIntoViewIfNeeded()
    await shot("place-on-bill.png")
    await addCheckItem(page, "Coffee", "4.50")
    await page.getByRole("button", { name: "Save draft for later" }).click()
    await expect(page.getByText("Draft saved")).toBeVisible()

    await page.getByRole("button", { name: "Back", exact: true }).click()
    await expect(
      page.getByRole("heading", { level: 1, name: "Tuesday lunch" })
    ).toBeVisible()
    await expect(page.getByText("Amazon")).toBeVisible()
    await expect(page.getByText("Walter paid")).toBeVisible()
    await expect(page.getByText("Draft saved")).toBeHidden()
    await shot("home-place-separate.png")

    for (const file of SHOT_FILES) {
      expect(existsSync(path.join(SHOTS, file)), file).toBe(true)
    }
  })
})
