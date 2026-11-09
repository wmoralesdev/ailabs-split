import { expect, test } from "@playwright/test"

import { addCheckItem, createDinner, startManualCheck } from "./dinner-helpers"

test("tip chips stay distinct from fields; fee can be amount or percent", async ({
  page,
}) => {
  await createDinner(page, `Tip fees ${Date.now()}`, "Ana")
  await startManualCheck(page)
  await page.getByLabel("Place").fill("Pizza night")
  await addCheckItem(page, "Pizza Margherita", "24.00")

  const section = page.getByRole("region", { name: "Tip and fees" })
  await section.scrollIntoViewIfNeeded()
  await expect(page.getByRole("button", { name: "10%" })).toBeVisible()
  await expect(page.getByRole("button", { name: "15%" })).toBeVisible()
  await expect(page.getByLabel("Custom tip amount")).toBeVisible()
  await expect(page.getByRole("button", { name: "10%" })).toHaveClass(
    /choice-chip/
  )

  await page
    .getByRole("button", { name: "Add a fee or service charge" })
    .click()
  await expect(page.getByLabel("Fee name")).toBeVisible()
  await expect(page.getByLabel("Fee amount")).toBeVisible()
  await expect(page.getByRole("button", { name: "Percent" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Add fee" })).toBeDisabled()

  await page.getByRole("button", { name: "10%" }).click()
  await expect(section.getByText("· added")).toBeVisible()
  await expect(page.locator("main")).toContainText("$2.40")

  await page.getByLabel("Fee name").fill("Service")
  await page.getByRole("button", { name: "Percent" }).click()
  await expect(page.getByLabel("Fee percent")).toBeVisible()
  await page.getByLabel("Fee percent").fill("10")
  await expect(page.getByText("Adds $2.40 on the item subtotal")).toBeVisible()
  await page.getByRole("button", { name: "Add fee" }).click()
  await expect(section.getByText("Service", { exact: true })).toBeVisible()
  await expect(page.locator("main")).toContainText("$28.80")

  await page.getByRole("button", { name: "Remove Service" }).click()
  await page
    .getByRole("button", { name: "Add a fee or service charge" })
    .click()
  await page.getByLabel("Fee name").fill("Late night")
  await expect(page.getByRole("button", { name: "Amount" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await page.getByLabel("Fee amount").fill("3.00")
  await page.getByRole("button", { name: "Add fee" }).click()
  await expect(section.getByText("Late night")).toBeVisible()
  await expect(page.locator("main")).toContainText("$29.40")
})
