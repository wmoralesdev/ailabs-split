import { expect, test } from "@playwright/test"
import type { Locator } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { openDinnerCreate, signInE2e, waitForHydration } from "./dinner-helpers"

const TICKET_PATH = path.resolve(
  "/cursor/stores/self/docs/tickets/celeste-imperio.jpg"
)
const SHOTS = "/cursor/stores/self/media/shadcn-improve-scan"

async function dropFile(target: Locator, filePath: string) {
  const data = readFileSync(filePath)
  const name = path.basename(filePath)
  await target.evaluate(
    (el, payload) => {
      const bytes = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0))
      const file = new File([bytes], payload.name, { type: payload.mime })
      const dt = new DataTransfer()
      dt.items.add(file)
      el.dispatchEvent(
        new DragEvent("dragenter", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
      )
      el.dispatchEvent(
        new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
      )
      el.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        })
      )
    },
    { data: data.toString("base64"), name, mime: "image/jpeg" }
  )
}

async function hoverDrop(target: Locator) {
  await target.evaluate((el) => {
    const dt = new DataTransfer()
    dt.items.add(new File(["x"], "ticket.jpg", { type: "image/jpeg" }))
    el.dispatchEvent(
      new DragEvent("dragenter", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      })
    )
    el.dispatchEvent(
      new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
      })
    )
  })
  await expect(target).toHaveAttribute("data-dropping", "true")
}

test.describe("scan drop and OCR wait", () => {
  test("desktop drop hover, OCR pending, after-scan bill", async ({ page }) => {
    test.skip(!existsSync(TICKET_PATH), "ticket photo is missing")
    mkdirSync(SHOTS, { recursive: true })

    await page.setViewportSize({ width: 1280, height: 800 })
    await signInE2e(page)
    await openDinnerCreate(page)
    await page.getByLabel("Your name").fill("Ana")

    const zone = page.getByTestId("ticket-drop-zone")
    await expect(zone).toBeVisible()
    await expect(
      page.getByText("Or drop or paste a ticket photo")
    ).toBeVisible()
    await hoverDrop(zone)
    await page.screenshot({
      path: path.join(SHOTS, "landing-drop-hover.png"),
      animations: "disabled",
    })

    await page.route("**/*", async (route) => {
      const request = route.request()
      const body = request.postDataBuffer()
      if (request.method() === "POST" && body && body.byteLength > 8_000) {
        await new Promise((resolve) => setTimeout(resolve, 2_200))
      }
      await route.continue()
    })

    await dropFile(zone, TICKET_PATH)

    const pending = page.getByRole("heading", { name: "Reading ticket…" })
    const review = page.getByRole("heading", { name: "Check the ticket" })
    await expect(pending.or(review).first()).toBeVisible({ timeout: 40_000 })
    if (await pending.isVisible()) {
      await expect(page.getByRole("status")).toContainText("Pulling the items")
      await page.screenshot({
        path: path.join(SHOTS, "ocr-pending.png"),
        animations: "disabled",
      })
    }

    await expect(review).toBeVisible({ timeout: 40_000 })
    await waitForHydration(page)
    await page.screenshot({
      path: path.join(SHOTS, "after-scan-bill.png"),
      animations: "disabled",
    })
    const bill = page.getByRole("textbox", { name: "Bill" })
    await expect(bill).not.toHaveValue("")
    await expect(bill).not.toHaveValue(/breakfast|lunch|dinner$/i)
    await expect(page.getByLabel("Place")).toHaveCount(0)
  })

  test("mobile 390 keeps camera and gallery", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    await openDinnerCreate(page)
    await expect(
      page.getByRole("button", { name: "Scan ticket" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "From gallery" })
    ).toBeVisible()
    await expect(page.getByTestId("ticket-drop-zone")).toBeVisible()
    await expect(page.getByText("Or drop or paste a ticket photo")).toBeHidden()
    await context.close()
  })
})
