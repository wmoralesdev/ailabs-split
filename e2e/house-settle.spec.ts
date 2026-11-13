import { expect, test } from "@playwright/test"

import { addHouseCharge, createHouse, setHouseMovedIn } from "./house-helpers"
import { addMonths, monthKey, monthStart } from "../src/lib/house-month"

test.describe("House settle", () => {
  test("a partial payment leaves the rest, Skip works, and Ana still owes by name", async ({
    page,
  }) => {
    await createHouse(page, {
      houseName: "Casa Settle",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await addHouseCharge(page, { title: "Rent", amountDigits: "28400" })
    await page.getByRole("link", { name: "Settle", exact: true }).click()
    const yours = page.getByRole("region", { name: "Yours" })
    await expect(yours.getByText("Ana pays you")).toBeVisible()
    await expect(yours.getByText("$142.00", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Ana paid me" }).click()
    await expect(page.getByLabel("How much?")).toBeVisible()
    await page.getByLabel("How much?").fill("10000")
    await page.getByRole("button", { name: "Continue" }).click()
    await expect(
      page.getByRole("heading", { name: "Record this payment" })
    ).toBeVisible()
    await page.getByRole("button", { name: "Skip" }).click()
    await expect(yours.getByText("$42.00", { exact: true })).toBeVisible()
    await expect(page.getByText("Ana owes $42.00")).toBeVisible()

    await page.getByRole("link", { name: "Home", exact: true }).click()
    await setHouseMovedIn(page, ["Ana"], monthStart(addMonths(monthKey(), -1)))
    await page.getByRole("link", { name: "People" }).click()
    await page.getByRole("button", { name: /Ana/ }).click()
    await page.getByRole("button", { name: "Move out…" }).click()
    const movedOut = page.getByRole("group", { name: "Moved out" })
    await movedOut.getByRole("button", { name: "Yesterday" }).click()
    await expect(
      movedOut.getByRole("button", { name: "Yesterday" })
    ).toHaveAttribute("aria-pressed", "true")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Moved out" })).toBeVisible()
    await expect(page.getByText("Ana owes $42.00")).toBeVisible()
    await expect(page.getByText(/Moved out /)).toBeVisible()
  })
})
