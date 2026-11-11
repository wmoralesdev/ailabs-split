import { expect, test } from "@playwright/test"
import { mkdirSync } from "node:fs"
import path from "node:path"

import {
  createDinner,
  openBill,
  openLanding,
  signInE2e,
  skipCookieBanner,
  waitForHydration,
} from "./dinner-helpers"

const SHOTS = "/cursor/stores/self/media/bill-delete-hide"

async function joinDinner(
  page: Parameters<typeof waitForHydration>[0],
  code: string,
  dinnerName: string,
  guestName: string
) {
  await skipCookieBanner(page)
  await page.goto("/?stay=true&tab=join", { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  await page.getByRole("tab", { name: "Join" }).click()
  await page.getByLabel("Code", { exact: true }).fill(code)
  await expect(page.getByText(dinnerName)).toBeVisible()
  await page.getByRole("button", { name: /add my name/i }).click()
  await page.getByLabel("Your name").fill(guestName)
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByRole("heading", { name: dinnerName })).toBeVisible()
}

test.describe("bill delete and hide", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  test.beforeAll(() => {
    mkdirSync(SHOTS, { recursive: true })
  })

  test("owner deletes a bill they created", async ({ page }) => {
    await signInE2e(page, { displayName: "Ana" })
    const { code, name } = await createDinner(page, "Ana")

    const deleteOnBill = page.getByRole("button", { name: "Delete this bill" })
    await deleteOnBill.scrollIntoViewIfNeeded()
    await expect(deleteOnBill).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Hide this bill" })
    ).toHaveCount(0)
    await page.screenshot({
      path: path.join(SHOTS, "owner-bill-delete.png"),
      animations: "disabled",
    })

    await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    const yours = page.getByRole("region", { name: "Your dinners and trips" })
    await expect(yours.getByText(name)).toBeVisible()
    await expect(
      yours.getByRole("button", { name: `Delete ${name}` })
    ).toBeVisible()
    await yours.screenshot({
      path: path.join(SHOTS, "owner-yours-delete.png"),
      animations: "disabled",
    })

    await yours.getByRole("button", { name: `Delete ${name}` }).click()
    const sheet = page.getByRole("dialog")
    await expect(
      sheet.getByRole("heading", { name: "Delete this bill?" })
    ).toBeVisible()
    await expect(
      sheet.getByText("It's gone for everyone at the table.")
    ).toBeVisible()
    await page.screenshot({
      path: path.join(SHOTS, "owner-confirm.png"),
      animations: "disabled",
    })
    await sheet.getByRole("button", { name: "Keep it" }).click()
    await expect(sheet).toBeHidden()
    await expect(yours.getByText(name)).toBeVisible()

    await yours.getByRole("button", { name: `Delete ${name}` }).click()
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete this bill" })
      .click()
    await expect(page.getByText("Bill deleted")).toBeVisible()
    await expect(page.getByText(name)).toHaveCount(0)

    await page.goto(`/r/${code}`, { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(
      page.getByRole("heading", { name: "Trip not found" })
    ).toBeVisible()
  })

  test("guest hides a bill without wiping it", async ({ page, browser }) => {
    await signInE2e(page, { displayName: "Ana" })
    const { code, name } = await createDinner(page, "Ana")

    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await joinDinner(guestPage, code, name, "Dee")

    await expect(
      guestPage.getByRole("button", { name: "Hide this bill" })
    ).toBeVisible()
    await expect(
      guestPage.getByRole("button", { name: "Delete this bill" })
    ).toHaveCount(0)
    await guestPage
      .getByRole("button", { name: "Hide this bill" })
      .scrollIntoViewIfNeeded()
    await guestPage.screenshot({
      path: path.join(SHOTS, "guest-bill-hide.png"),
      animations: "disabled",
    })

    await openBill(guestPage)
    await expect(
      guestPage.getByRole("button", { name: "Hide this bill" })
    ).toBeVisible()
    await expect(
      guestPage.getByRole("button", { name: "Delete this bill" })
    ).toHaveCount(0)
    await guestPage
      .getByRole("button", { name: "Hide this bill" })
      .scrollIntoViewIfNeeded()
    await guestPage.screenshot({
      path: path.join(SHOTS, "guest-bill-editor-hide.png"),
      animations: "disabled",
    })
    await guestPage.getByRole("button", { name: "Back", exact: true }).click()

    await guestPage.getByRole("button", { name: "Hide this bill" }).click()
    await expect(
      guestPage.getByRole("heading", { name: "Split" })
    ).toBeVisible()
    await expect(guestPage.getByText(name)).toHaveCount(0)
    await guestPage.screenshot({
      path: path.join(SHOTS, "guest-hidden-home.png"),
      animations: "disabled",
    })

    await expect(page.getByRole("heading", { name })).toBeVisible()
    await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(
      page
        .getByRole("region", { name: "Your dinners and trips" })
        .getByText(name)
    ).toBeVisible()
    await page.screenshot({
      path: path.join(SHOTS, "owner-still-there.png"),
      animations: "disabled",
    })

    await guestPage.goto(`/r/${code}`, { waitUntil: "domcontentloaded" })
    await waitForHydration(guestPage)
    await expect(guestPage.getByRole("heading", { name })).toBeVisible()
    await guest.close()
  })

  test("signed-in hide stays off the list after reload", async ({
    page,
    browser,
  }) => {
    await signInE2e(page, { displayName: "Ana" })
    const { code, name } = await createDinner(page, "Ana")

    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await signInE2e(guestPage, { displayName: "Dee" })
    await joinDinner(guestPage, code, name, "Dee")
    await guestPage.getByRole("button", { name: "Hide this bill" }).click()
    await expect(
      guestPage.getByRole("heading", { name: "Split" })
    ).toBeVisible()
    await expect(guestPage.getByText(name)).toHaveCount(0)

    await guestPage.evaluate(
      (trip) => {
        window.localStorage.setItem(
          "split:recent-trips",
          JSON.stringify([trip])
        )
      },
      { code, name, updatedAt: Date.now(), kind: "DINNER" }
    )
    await guestPage.reload({ waitUntil: "domcontentloaded" })
    await waitForHydration(guestPage)
    await expect(guestPage.getByText(name)).toHaveCount(0)
    await guest.close()
  })

  test("guest hide from recent uses the same chrome", async ({ page }) => {
    await openLanding(page)
    await page.evaluate(
      (trips) => {
        window.localStorage.setItem("split:recent-trips", JSON.stringify(trips))
      },
      [
        {
          code: "HIDE01A",
          name: "Monday lunch",
          updatedAt: Date.now() - 60_000,
          kind: "DINNER",
        },
      ]
    )
    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    const recent = page.getByRole("region", { name: "Recent trips" })
    await expect(recent.getByText("Monday lunch")).toBeVisible()
    await expect(
      recent.getByRole("button", { name: "Hide Monday lunch" })
    ).toBeVisible()
    await expect(
      recent.getByRole("button", { name: "Delete Monday lunch" })
    ).toHaveCount(0)
    await recent.screenshot({
      path: path.join(SHOTS, "guest-recent-hide.png"),
      animations: "disabled",
    })
    await recent.getByRole("button", { name: "Hide Monday lunch" }).click()
    await expect(recent.getByText("Monday lunch")).toHaveCount(0)
  })
})
