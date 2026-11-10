import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import {
  addCheckItem,
  addPeople,
  assignEqual,
  createDinner,
  openBill,
  openPersonSheet,
} from "./dinner-helpers"

const SHOTS_DIR = "/cursor/stores/self/media/person-sheet-title-input"

function shot(
  page: { screenshot: (opts: { path: string }) => Promise<unknown> },
  name: string
) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  return page.screenshot({ path: path.join(SHOTS_DIR, name) })
}

test.describe.configure({ mode: "serial" })

test("person sheet uses the name field as the title", async ({ page }) => {
  await createDinner(page, "Ana")
  await openBill(page)
  await addPeople(page, ["Ben"])
  await addCheckItem(page, "Salad", "6.50")
  await addCheckItem(page, "Drink", "4.00")
  await addCheckItem(page, "Pizza", "14.00")
  await assignEqual(page, "Salad", ["Ben"])
  await assignEqual(page, "Drink", ["Ben"])
  await assignEqual(page, "Pizza", ["Ben"])

  const sheet = await openPersonSheet(page, "Ben")
  const nameField = sheet.getByLabel("Name")
  await expect(nameField).toHaveValue("Ben")
  await expect(nameField).toBeFocused()
  await expect
    .poll(async () =>
      nameField.evaluate((node) => (node as HTMLInputElement).selectionStart)
    )
    .toBe(3)
  await expect(sheet.getByRole("heading", { name: "Ben" })).toHaveCount(0)
  await expect(
    sheet.getByText("Change the name or take them off.")
  ).toHaveCount(0)
  await expect(sheet.getByText("3 items · $24.50")).toBeVisible()
  const save = sheet.getByRole("button", { name: "Save" })
  await expect(save).toBeDisabled()
  await expect(
    sheet.getByRole("button", { name: "Remove from bill" })
  ).toBeVisible()
  await shot(page, "title-input.png")

  await nameField.pressSequentially("jamin")
  await expect(nameField).toHaveValue("Benjamin")
  await expect(save).toBeEnabled()
  await shot(page, "dirty-save.png")

  await nameField.fill("Ben")
  await expect(save).toBeDisabled()
  await sheet.getByRole("button", { name: "Remove from bill" }).click()
  await expect(
    sheet.getByText("Remove Ben? His 3 items go back to unassigned.")
  ).toBeVisible()
  await shot(page, "remove-confirm.png")

  await sheet.getByRole("button", { name: "Remove", exact: true }).click()
  await expect(sheet).toBeHidden()
  await expect(
    page.getByRole("button", { name: "Edit Ben", exact: true })
  ).toHaveCount(0)
  const snackbar = page.locator("[data-sonner-toast]").filter({
    hasText: "Ben removed",
  })
  await expect(snackbar).toBeVisible()
  await expect(snackbar.getByRole("button", { name: "Undo" })).toBeVisible()
  await expect
    .poll(async () =>
      snackbar.evaluate((node) => getComputedStyle(node).opacity)
    )
    .toBe("1")
  await expect(page.getByText("Who had this?")).toHaveCount(3)
  await shot(page, "undo-snackbar.png")

  await page.getByRole("button", { name: "Undo" }).click()
  await expect(
    page.getByRole("button", { name: "Edit Ben", exact: true })
  ).toBeVisible()
  await expect(
    page
      .getByRole("listitem")
      .filter({
        has: page.getByRole("button", { name: /Pizza/ }),
      })
      .getByRole("button", { name: "Ben", exact: true })
  ).toHaveAttribute("aria-pressed", "true")

  for (const name of [
    "title-input.png",
    "dirty-save.png",
    "remove-confirm.png",
    "undo-snackbar.png",
  ]) {
    expect(existsSync(path.join(SHOTS_DIR, name)), name).toBe(true)
  }
})
