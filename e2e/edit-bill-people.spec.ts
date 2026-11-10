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
  skipCookieBanner,
  waitForHydration,
} from "./dinner-helpers"

const SHOTS_DIR = "/cursor/stores/self/media/edit-bill-people"

function shot(
  page: { screenshot: (opts: { path: string }) => Promise<unknown> },
  name: string
) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  return page.screenshot({ path: path.join(SHOTS_DIR, name) })
}

test.describe.configure({ mode: "serial" })

test("edit and remove a guest on the dinner bill", async ({
  page,
  browser,
}) => {
  const { code: dinnerCode, name: dinnerName } = await createDinner(page, "Ana")
  await openBill(page)
  await addPeople(page, ["Ben", "Cam"])
  await expect(
    page.getByRole("button", { name: "Edit Ana", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Edit Ben", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Edit Cam", exact: true })
  ).toBeVisible()
  await shot(page, "people-chips.png")

  const benSheet = await openPersonSheet(page, "Ben")
  await expect(benSheet.getByLabel("Name")).toHaveValue("Ben")
  await expect(
    benSheet.getByRole("button", { name: "Remove from bill" })
  ).toBeVisible()
  await shot(page, "edit-sheet.png")
  await benSheet.getByLabel("Name").fill("Benjamin")
  await benSheet.getByRole("button", { name: "Save name" }).click()
  await expect(benSheet).toBeHidden()
  await expect(
    page.getByRole("button", { name: "Edit Benjamin", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Edit Ben", exact: true })
  ).toHaveCount(0)
  await shot(page, "renamed.png")

  await addCheckItem(page, "Pizza Margherita", "24.00")
  await assignEqual(page, "Pizza Margherita", ["Ana", "Benjamin", "Cam"])

  const camSheet = await openPersonSheet(page, "Cam")
  await expect(
    camSheet.getByText("They're taken off any dishes they're on.")
  ).toBeVisible()
  await shot(page, "remove-sheet.png")
  await camSheet.getByRole("button", { name: "Remove from bill" }).click()
  await expect(camSheet).toBeHidden()
  await expect(
    page.getByRole("button", { name: "Edit Cam", exact: true })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Edit Benjamin", exact: true })
  ).toBeVisible()

  const pizza = page.getByRole("listitem").filter({
    has: page.getByRole("button", { name: /Pizza Margherita/ }),
  })
  await expect(
    pizza.getByRole("button", { name: "Cam", exact: true })
  ).toHaveCount(0)
  await expect(
    pizza.getByRole("button", { name: "Ana", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    pizza.getByRole("button", { name: "Benjamin", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await shot(page, "after-remove.png")

  const anaSheet = await openPersonSheet(page, "Ana")
  await expect(anaSheet.getByText("That's you on this device.")).toBeVisible()
  await expect(
    anaSheet.getByRole("button", { name: "Remove from bill" })
  ).toHaveCount(0)
  await anaSheet.getByRole("button", { name: "Close" }).click()
  await expect(anaSheet).toBeHidden()

  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  await skipCookieBanner(guestPage)
  await guestPage.goto("/?stay=true&tab=join")
  await waitForHydration(guestPage)
  await guestPage.getByRole("tab", { name: "Join" }).click()
  await guestPage.getByLabel("Code", { exact: true }).fill(dinnerCode)
  await expect(guestPage.getByText(dinnerName)).toBeVisible()
  await guestPage.getByRole("button", { name: /add my name/i }).click()
  await guestPage.getByLabel("Your name").fill("Benjamin")
  await guestPage.getByRole("button", { name: "Continue" }).click()
  await expect(
    guestPage.getByRole("heading", { name: dinnerName })
  ).toBeVisible()
  await expect(guestPage.getByText("You · Benjamin")).toBeVisible()
  await guest.close()

  for (const name of [
    "people-chips.png",
    "edit-sheet.png",
    "renamed.png",
    "remove-sheet.png",
    "after-remove.png",
  ]) {
    expect(existsSync(path.join(SHOTS_DIR, name)), name).toBe(true)
  }
})
