import { expect, test } from "@playwright/test"

import { createHouse } from "./house-helpers"

test.describe("House people", () => {
  test("the owner has to transfer before moving out", async ({ page }) => {
    await createHouse(page, {
      houseName: "Casa People Owner",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await page.getByRole("link", { name: "People" }).click()
    await expect(page.getByRole("heading", { name: "People" })).toBeVisible()
    await page.getByRole("button", { name: /Walter/ }).click()
    await expect(
      page.getByText("Transfer the house before you move out")
    ).toBeVisible()
  })

  test("an unclaimed housemate with no charges can be removed", async ({
    page,
  }) => {
    await createHouse(page, {
      houseName: "Casa People Remove",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await page.getByRole("link", { name: "People" }).click()
    await page.getByLabel("Housemates").fill("Luis")
    await page.getByLabel("Housemates").press("Enter")
    await page.getByRole("button", { name: "Add people" }).click()
    await expect(
      page.getByRole("button", { name: /Luis/ }).filter({ hasNotText: "Remove" })
    ).toBeVisible()
    await page
      .getByRole("button", { name: /Luis/ })
      .filter({ hasNotText: "Remove" })
      .click()
    await page.getByRole("button", { name: "Remove" }).click()
    await page.getByRole("button", { name: "Remove Luis?" }).click()
    await expect(page.getByRole("button", { name: /Luis/ })).toHaveCount(0)
  })

  test("moved out still shows Ana by name", async ({ page }) => {
    await createHouse(page, {
      houseName: "Casa People Left",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await page.getByRole("link", { name: "People" }).click()
    await page.getByRole("button", { name: /Ana/ }).click()
    const movedIn = page.getByRole("group", { name: "Moved in" })
    await movedIn.getByRole("button", { name: "Yesterday" }).click()
    await expect(
      movedIn.getByRole("button", { name: "Yesterday" })
    ).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("button", { name: "Move out…" }).click()
    const movedOut = page.getByRole("group", { name: "Moved out" })
    await movedOut.getByRole("button", { name: "Yesterday" }).click()
    await expect(
      movedOut.getByRole("button", { name: "Yesterday" })
    ).toHaveAttribute("aria-pressed", "true")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Moved out" })).toBeVisible()
    await expect(page.getByText("Ana is square")).toBeVisible()
    await expect(page.getByText(/Moved out /)).toBeVisible()
  })
})
