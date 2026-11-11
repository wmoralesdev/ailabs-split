import { expect, test } from "@playwright/test"
import { mkdirSync } from "node:fs"
import path from "node:path"

import { createOwingDinner, goHome, recordPayment } from "./dinner-helpers"

const SHOTS = "/cursor/stores/self/media/settle-all"

function shot(
  page: { screenshot: (opts: object) => Promise<unknown> },
  name: string
) {
  mkdirSync(SHOTS, { recursive: true })
  return page.screenshot({
    path: path.join(SHOTS, name),
    animations: "disabled",
  })
}

async function twoOwingDinners(page: Parameters<typeof createOwingDinner>[0]) {
  await createOwingDinner(page, {
    creator: "Ana",
    payer: "Walter",
    dinnerName: "Biblioteca",
    item: "Cortado",
    amount: "24.00",
  })
  await goHome(page)
  await expect(page.getByTestId("to-settle-card")).toHaveCount(0)

  await createOwingDinner(page, {
    creator: "Ana",
    payer: "Walter",
    dinnerName: "Celeste",
    item: "Tacos",
    amount: "16.00",
    fromHome: true,
  })
  await goHome(page)
  const card = page.getByTestId("to-settle-card")
  await expect(card).toBeVisible()
  await card.scrollIntoViewIfNeeded()
  return card
}

test.describe("home to settle", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  test("card for 2+ dinners, row opens settle, one paid removes it", async ({
    page,
  }) => {
    const card = await twoOwingDinners(page)
    await expect(card.getByText("To settle")).toBeVisible()
    await expect(card.getByText("You owe $20.00")).toBeVisible()
    await expect(card.getByText("2 dinners · Pay Walter")).toBeVisible()
    await shot(page, "home-card.png")

    await card.click()
    const sheet = page.getByRole("dialog")
    await expect(
      sheet.getByRole("heading", { name: "Settle everything" })
    ).toBeVisible()
    await expect(sheet.getByText("Biblioteca")).toBeVisible()
    await expect(sheet.getByText("Celeste")).toBeVisible()
    await expect(sheet.getByText("$12.00")).toBeVisible()
    await expect(sheet.getByText("$8.00")).toBeVisible()
    await expect(sheet).toHaveCSS("opacity", "1")
    await shot(page, "settle-everything.png")

    await sheet.getByRole("button", { name: /Biblioteca/ }).click()
    await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible()
    await expect(
      page.getByRole("button", { name: "I paid Walter" })
    ).toBeVisible()
    await shot(page, "dinner-settle.png")

    await page.getByRole("button", { name: "I paid Walter" }).click()
    await recordPayment(page)

    await goHome(page)
    await expect(page.getByTestId("to-settle-card")).toHaveCount(0)
    await shot(page, "after-one-paid.png")
  })

  test("I paid all of it records each dinner", async ({ page }) => {
    const card = await twoOwingDinners(page)
    await card.click()
    const list = page.getByRole("dialog")
    await expect(
      list.getByRole("heading", { name: "Settle everything" })
    ).toBeVisible()
    await list.getByRole("button", { name: "I paid all of it" }).click()

    const proof = page.getByRole("dialog")
    await expect(
      proof.getByRole("heading", { name: "Record this payment" })
    ).toBeVisible()
    await expect(proof.getByRole("button", { name: "Skip" })).toBeVisible()
    await expect(proof).toHaveCSS("opacity", "1")
    await shot(page, "pay-all-proof.png")
    await proof.getByRole("button", { name: "Skip" }).click()
    await expect(page.getByText("Payments recorded")).toBeVisible()
    await expect(page.getByTestId("to-settle-card")).toHaveCount(0)
    await shot(page, "after-pay-all.png")
  })

  test("hidden dinner drops out of the sum", async ({ page }) => {
    const card = await twoOwingDinners(page)
    await expect(card.getByText("You owe $20.00")).toBeVisible()

    const recent = page.getByRole("region", { name: "Recent trips" })
    await recent.getByRole("button", { name: "Hide Celeste" }).click()
    await expect(recent.getByText("Celeste")).toHaveCount(0)
    await expect(page.getByTestId("to-settle-card")).toHaveCount(0)
    await shot(page, "after-hide.png")
  })
})
