import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
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
  openDinnerCreate,
  signInE2e,
  waitForHydration,
} from "./dinner-helpers"

const TICKET_PATH = path.resolve(
  "/cursor/stores/self/docs/tickets/celeste-imperio.jpg"
)
const SHOTS = "/cursor/stores/self/media/image-paste"
const PROOF_PATH = path.join(os.tmpdir(), "split-paste-proof.png")

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

/** Fires the same `paste` event Ctrl/Cmd+V produces, with a clipboard image. */
async function pasteClipboardImage(
  page: Page,
  filePath: string,
  mime: "image/jpeg" | "image/png"
) {
  const data = readFileSync(filePath)
  await page.evaluate(
    ({ payload, name, mime: type }) => {
      const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
      const file = new File([bytes], name, { type })
      const dt = new DataTransfer()
      dt.items.add(file)
      const event = new Event("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: dt })
      window.dispatchEvent(event)
    },
    { payload: data.toString("base64"), name: path.basename(filePath), mime }
  )
}

function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true })
  return page.screenshot({
    path: path.join(SHOTS, name),
    animations: "disabled",
  })
}

test.describe("image paste on upload surfaces", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("dinner scan attaches a pasted ticket photo", async ({ page }) => {
    test.skip(!existsSync(TICKET_PATH), "ticket photo is missing")
    mkdirSync(SHOTS, { recursive: true })

    await signInE2e(page)
    await openDinnerCreate(page)
    await page.getByLabel("Your name").fill("Ana")
    await expect(page.getByTestId("ticket-drop-zone")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Scan ticket" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "From gallery" })
    ).toBeVisible()
    await shot(page, "390-scan-ready.png")

    await pasteClipboardImage(page, TICKET_PATH, "image/jpeg")

    const pending = page.getByRole("heading", { name: "Reading ticket…" })
    const review = page.getByRole("heading", { name: "Check the ticket" })
    await expect(pending.or(review).first()).toBeVisible({ timeout: 40_000 })
    await expect(review).toBeVisible({ timeout: 40_000 })
    await waitForHydration(page)
    await shot(page, "390-scan-pasted.png")
    const bill = page.getByRole("textbox", { name: "Bill" })
    await expect(bill).not.toHaveValue("")
    await expect(bill).not.toHaveValue(/breakfast|lunch|dinner$/i)
    await expect(page.getByLabel("Place")).toHaveCount(0)
  })

  test("desktop scan hint mentions paste", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await signInE2e(page)
    await openDinnerCreate(page)
    await expect(
      page.getByText("Or drop or paste a ticket photo")
    ).toBeVisible()
    await shot(page, "desktop-scan-hint.png")
  })

  test("payment proof attaches a pasted photo", async ({ page }) => {
    await writeProofFixture()
    expect(existsSync(PROOF_PATH)).toBe(true)

    const { name: dinnerName } = await createDinner(page, "Ana")
    await openBill(page)
    await addPeople(page, ["Ben", "Cam"])
    await addCheckItem(page, "Pizza Margherita", "24.00")
    await addCheckItem(page, "Pizza Pepperoni", "24.00")
    await assignEqual(page, "Pizza Margherita", ["Ana", "Ben", "Cam"])
    await assignEqualInSheet(page, "Pizza Pepperoni", ["Ana", "Ben", "Cam"])
    await confirmCheck(page)
    await expect(page.getByRole("heading", { name: dinnerName })).toBeVisible()

    await dinnerNav(page).getByRole("link", { name: "Settle" }).click()
    await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible()
    await expect(page.getByText("Bill confirmed")).toHaveCount(0)
    await page
      .getByRole("button", { name: /paid me/ })
      .first()
      .click()

    const sheet = page.getByRole("dialog")
    await expect(
      sheet.getByRole("heading", { name: "Record this payment" })
    ).toBeVisible()
    await expect(sheet).toHaveCSS("opacity", "1")
    await expect(
      sheet.getByRole("button", { name: "From photos" })
    ).toBeVisible()
    await shot(page, "390-proof-ready.png")

    await pasteClipboardImage(page, PROOF_PATH, "image/png")

    const preview = page.getByTestId("payment-proof-preview")
    await expect(preview).toBeVisible()
    await expect
      .poll(async () =>
        preview.evaluate((img) => (img as HTMLImageElement).naturalHeight)
      )
      .toBeGreaterThan(0)
    await shot(page, "390-proof-pasted.png")
  })
})
