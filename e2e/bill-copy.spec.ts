import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"

import {
  createDinner,
  createOwingDinner,
  goHome,
  openDinnerCreate,
  signInE2e,
  skipCookieBanner,
  waitForHydration,
} from "./dinner-helpers"

const SHOTS = "/cursor/stores/self/media/bill-copy"

const SHOT_FILES = [
  "landing-bill.png",
  "sign-in-bills.png",
  "bill-home.png",
  "bill-name-sheet.png",
  "join-bill.png",
  "yours-bill.png",
  "recent-bill.png",
  "settle-bills.png",
] as const

function shot(
  page: { screenshot: (opts: object) => Promise<unknown> },
  name: (typeof SHOT_FILES)[number]
) {
  mkdirSync(SHOTS, { recursive: true })
  return page.screenshot({
    path: path.join(SHOTS, name),
    animations: "disabled",
  })
}

test.describe("bill copy", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  test.afterAll(() => {
    for (const file of SHOT_FILES) {
      expect(existsSync(path.join(SHOTS, file)), file).toBe(true)
    }
  })

  test("landing, sign-in, home, rename, and join say bill", async ({
    page,
  }) => {
    await skipCookieBanner(page)
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
    await expect(
      page.getByText("Keep bills and trips on every device.")
    ).toBeVisible()
    await shot(page, "sign-in-bills.png")

    await openDinnerCreate(page)
    await expect(page).toHaveTitle("Split — bills and trips")
    const billChip = page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Bill" })
    await expect(billChip).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByText("One bill, tonight")).toBeVisible()
    await expect(page.getByLabel("Your name")).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Scan ticket" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Create without a ticket" })
    ).toBeVisible()
    await expect(
      page.getByRole("group", { name: "Mode" }).getByRole("button", {
        name: "Dinner",
        exact: true,
      })
    ).toHaveCount(0)
    await shot(page, "landing-bill.png")

    await page.getByLabel("Your name").fill("Ana")
    await page.getByRole("button", { name: "Create without a ticket" }).click()
    const heading = page.getByRole("heading", {
      level: 1,
      name: /(breakfast|lunch|dinner)$/,
    })
    await expect(heading).toBeVisible()
    const name = (await heading.innerText()).trim()
    const code = new URL(page.url()).pathname.split("/")[2] ?? ""
    expect(code.length).toBeGreaterThanOrEqual(6)
    await expect(page.getByText("Bill", { exact: true }).first()).toBeVisible()
    await expect(
      page.getByRole("button", { name: `Copy bill code ${code}` })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Hide this bill" })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: "Share bill" })).toBeVisible()
    await shot(page, "bill-home.png")

    await page.getByRole("button", { name: `Rename ${name}` }).click()
    const sheet = page.getByRole("dialog")
    await expect(
      sheet.getByRole("heading", { name: "Bill name" })
    ).toBeVisible()
    await expect(sheet.getByRole("textbox", { name: "Bill" })).toHaveValue(name)
    await expect(
      sheet.getByText("The bill title. Place on the bill is separate.")
    ).toBeVisible()
    await shot(page, "bill-name-sheet.png")
    await sheet.getByRole("button", { name: "Save name" }).click()
    await expect(sheet).toBeHidden()

    const guestPage = await page.context().newPage()
    await skipCookieBanner(guestPage)
    await guestPage.goto("/?stay=true&tab=join", {
      waitUntil: "domcontentloaded",
    })
    await waitForHydration(guestPage)
    await guestPage.getByRole("tab", { name: "Join" }).click()
    await guestPage.getByLabel("Code", { exact: true }).fill(code)
    const joinPanel = guestPage.getByRole("tabpanel", { name: "Join" })
    await expect(joinPanel.getByText(/Joining bill/i)).toBeVisible()
    await expect(joinPanel.getByText(name)).toBeVisible()
    await shot(guestPage, "join-bill.png")
    await guestPage.close()
  })

  test("yours lists the room as a bill", async ({ page }) => {
    await signInE2e(page)
    const { name } = await createDinner(page, "Ana")
    await goHome(page)
    const yours = page.getByRole("region", { name: "Your bills and trips" })
    await expect(yours).toBeVisible()
    await expect(yours.getByText(name)).toBeVisible()
    await expect(yours.getByText("Bill", { exact: true })).toBeVisible()
    await yours.scrollIntoViewIfNeeded()
    await shot(page, "yours-bill.png")
  })

  test("recent kind badge says Bill", async ({ page }) => {
    await page.addInitScript(
      (trips) => {
        window.localStorage.setItem("split:recent-trips", JSON.stringify(trips))
      },
      [
        {
          code: "MQTF3K7",
          name: "Monday lunch",
          updatedAt: Date.now() - 37 * 60_000,
          kind: "DINNER",
        },
        {
          code: "UK3R47Y",
          name: "Guate pet",
          updatedAt: Date.now() - 27 * 86_400_000,
          kind: "TRIP",
        },
      ]
    )
    await skipCookieBanner(page)
    await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    const recent = page.getByRole("region", { name: "Recent trips" })
    await expect(recent.getByText("Monday lunch")).toBeVisible()
    await expect(recent.getByText("Bill", { exact: true })).toBeVisible()
    await expect(recent.getByText("Dinner", { exact: true })).toHaveCount(0)
    await expect(recent.getByText("Trip", { exact: true })).toBeVisible()
    await recent.scrollIntoViewIfNeeded()
    await shot(page, "recent-bill.png")
  })

  test("to-settle card counts bills", async ({ page }) => {
    await createOwingDinner(page, {
      creator: "Ana",
      payer: "Walter",
      dinnerName: "Biblioteca",
      item: "Cortado",
      amount: "24.00",
    })
    await goHome(page)
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
    await expect(card.getByText("To settle")).toBeVisible()
    await expect(card.getByText("2 bills · Pay Walter")).toBeVisible()
    await card.scrollIntoViewIfNeeded()
    await shot(page, "settle-bills.png")
  })
})
