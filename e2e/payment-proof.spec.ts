import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"

import {
  addCheckItem,
  addPeople,
  assignEqual,
  assignEqualInSheet,
  confirmCheck,
  createDinner,
  dinnerNav,
  openBill,
  recordPayment,
} from "./dinner-helpers"

const SHOTS_DIR =
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/payment-proof"
const PROOF_PATH = path.join(os.tmpdir(), "split-transfer-proof.png")

async function writeProofFixture() {
  const svg = Buffer.from(
    `<svg width="390" height="640" xmlns="http://www.w3.org/2000/svg">
      <rect width="390" height="640" fill="#0e201a"/>
      <text x="32" y="72" font-size="18" fill="#9cb5aa" font-family="sans-serif">Bank transfer</text>
      <text x="32" y="140" font-size="40" fill="#f4faf6" font-family="sans-serif">$16.00</text>
      <text x="32" y="188" font-size="16" fill="#d7efe4" font-family="sans-serif">To Ana</text>
    </svg>`
  )
  await sharp(svg).png().toFile(PROOF_PATH)
}

function shot(
  page: { screenshot: (opts: { path: string }) => Promise<unknown> },
  name: string
) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  return page.screenshot({ path: path.join(SHOTS_DIR, name) })
}

async function waitForSettleSheet(page: Page) {
  const sheet = page.getByRole("dialog")
  await expect(
    sheet.getByRole("heading", { name: "Record this payment" })
  ).toBeVisible()
  await expect(
    sheet.getByRole("button", { name: "Record payment" })
  ).toBeVisible()
  await expect(sheet).toHaveCSS("opacity", "1")
}

test.describe.configure({ mode: "serial" })

test("optional payment proof: empty and with photo", async ({ page }) => {
  await writeProofFixture()
  expect(existsSync(PROOF_PATH)).toBe(true)

  const { name: dinnerName } = await createDinner(page, "Ana")
  await openBill(page)
  await addPeople(page, ["Ben", "Cam"])
  await page.getByLabel("Place").fill("Pizza night")
  await addCheckItem(page, "Pizza Margherita", "24.00")
  await addCheckItem(page, "Pizza Pepperoni", "24.00")
  await assignEqual(page, "Pizza Margherita", ["Ana", "Ben", "Cam"])
  await assignEqualInSheet(page, "Pizza Pepperoni", ["Ana", "Ben", "Cam"])
  await confirmCheck(page)
  await expect(page.getByRole("heading", { name: dinnerName })).toBeVisible()

  await dinnerNav(page).getByRole("link", { name: "Settle" }).click()
  await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible()
  await expect(page.getByRole("button", { name: /paid me/ })).toHaveCount(2)

  await page
    .getByRole("button", { name: /paid me/ })
    .first()
    .click()
  await waitForSettleSheet(page)
  await expect(
    page.getByText("A photo of the transfer is optional.")
  ).toBeVisible()
  await expect(page.getByText("Bill confirmed")).toHaveCount(0)
  await shot(page, "empty-sheet.png")
  await recordPayment(page)
  await expect(page.getByRole("heading", { name: "Paid" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: /View transfer photo/ })
  ).toHaveCount(0)
  await expect(page.getByText("Payment recorded")).toHaveCount(0)
  await shot(page, "empty-paid.png")
  expect(existsSync(path.join(SHOTS_DIR, "empty-sheet.png"))).toBe(true)
  expect(existsSync(path.join(SHOTS_DIR, "empty-paid.png"))).toBe(true)

  await page.getByRole("button", { name: /paid me/ }).click()
  await waitForSettleSheet(page)
  await page
    .getByTestId("payment-proof-gallery-input")
    .setInputFiles(PROOF_PATH)
  const preview = page.getByTestId("payment-proof-preview")
  await expect(preview).toBeVisible()
  await expect
    .poll(async () =>
      preview.evaluate((img) => (img as HTMLImageElement).naturalHeight)
    )
    .toBeGreaterThan(0)
  await shot(page, "with-photo-sheet.png")
  await page.getByRole("button", { name: "Record payment" }).click()
  await expect(page.getByText("Payment recorded")).toBeVisible({
    timeout: 30_000,
  })
  await expect(
    page.getByRole("heading", { name: "Record this payment" })
  ).toBeHidden()
  await expect(
    page.getByRole("button", { name: /View transfer photo/ })
  ).toHaveCount(1)
  await expect(page.getByText("Payment recorded")).toHaveCount(0)
  await shot(page, "with-photo-paid.png")

  await page.getByRole("button", { name: /View transfer photo/ }).click()
  const view = page.getByRole("dialog")
  await expect(
    view.getByRole("heading", { name: "Transfer photo" })
  ).toBeVisible()
  await expect(view).toHaveCSS("opacity", "1")
  const full = page.getByTestId("payment-proof-full")
  await expect(full).toBeVisible()
  await expect
    .poll(async () =>
      full.evaluate((img) => (img as HTMLImageElement).naturalHeight)
    )
    .toBeGreaterThan(0)
  await shot(page, "with-photo-view.png")

  for (const name of [
    "empty-sheet.png",
    "empty-paid.png",
    "with-photo-sheet.png",
    "with-photo-paid.png",
    "with-photo-view.png",
  ]) {
    expect(existsSync(path.join(SHOTS_DIR, name)), name).toBe(true)
  }
})
