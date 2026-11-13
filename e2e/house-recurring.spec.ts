import { expect, test } from "@playwright/test"

import { createHouse } from "./house-helpers"

test.describe("House recurring", () => {
  test("a template does not change balances until Confirm, and delete returns it to Due", async ({
    page,
  }) => {
    await createHouse(page, {
      houseName: "Casa Recurring",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await expect(page.getByText("You're square")).toBeVisible()
    await page.getByRole("link", { name: "Recurring" }).click()
    await expect(
      page.getByRole("heading", { name: "Recurring", exact: true })
    ).toBeVisible()
    await page.getByRole("button", { name: "Add recurring" }).click()
    await expect(
      page.getByRole("heading", { name: "Add recurring" })
    ).toBeVisible()
    await page.getByLabel("What was it?").fill("Rent")
    await page.getByLabel("Amount").fill("90000")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("Rent", { exact: true })).toBeVisible()
    await page.getByRole("link", { name: "Home", exact: true }).click()
    await expect(page.getByText("You're square")).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Due this month" })
    ).toBeVisible()
    await expect(page.getByText("Rent", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Confirm" }).click()
    await expect(page.getByText("You get back $450.00")).toBeVisible()
    await expect(page.getByRole("button", { name: "Confirm" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /Rent/ })).toHaveCount(1)

    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: /Rent/ }).click()
    await page.getByRole("button", { name: "Delete" }).click()
    await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible()
    await expect(page.getByText("You're square")).toBeVisible()
  })
})
