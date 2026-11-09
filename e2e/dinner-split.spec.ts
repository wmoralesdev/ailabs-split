import { expect, test } from "@playwright/test"
import { existsSync } from "node:fs"
import path from "node:path"

import {
  addCheckItem,
  addPeople,
  assignEqual,
  assignEqualInSheet,
  assignQuantities,
  confirmCheck,
  createDinner,
  dinnerNav,
  openLanding,
  startManualCheck,
  waitForHydration,
} from "./dinner-helpers"

const TICKET_PATH = path.resolve(
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/docs/tickets/biblioteca-cafe.jpg"
)

test.describe.configure({ mode: "serial" })

test.describe("dinner split", () => {
  let dinnerCode = ""
  const dinnerName = `Friday pizzas ${Date.now()}`

  test("create dinner, add people, two pizzas, confirm, settle, join", async ({
    page,
    browser,
  }) => {
    dinnerCode = await createDinner(page, dinnerName, "Ana")
    await expect(page.getByText("You · Ana")).toBeVisible()
    await expect(page.getByText(/1 person/)).toBeVisible()

    await addPeople(page, ["Ben", "Cam"])
    await expect(page.getByText("3 people")).toBeVisible()

    await startManualCheck(page)
    await page.getByLabel("Place").fill("Pizza night")
    await expect(page.getByRole("group", { name: "Paid by" })).toContainText(
      "Ana"
    )

    await addCheckItem(page, "Pizza Margherita", "24.00")
    await addCheckItem(page, "Pizza Pepperoni", "24.00")

    await expect(
      page.getByRole("button", { name: "Confirm check" })
    ).toBeDisabled()
    await expect(page.getByRole("alert")).toContainText(
      "Assign every item before confirming"
    )
    await expect(page.getByText("Add tip")).toBeVisible()
    await expect(page.getByRole("button", { name: "10%" })).toBeVisible()

    await assignEqual(page, "Pizza Margherita", ["Ana", "Ben", "Cam"])
    await expect(page.getByText("$8.00 each")).toBeVisible()
    await assignEqualInSheet(page, "Pizza Pepperoni", ["Ana", "Ben", "Cam"])

    await expect(page.getByText("Total", { exact: true })).toBeVisible()
    await expect(page.locator("main")).toContainText("$48.00")
    await expect(page.getByText("Add tip")).toBeVisible()

    await confirmCheck(page)
    await expect(page.getByRole("heading", { name: dinnerName })).toBeVisible()
    await expect(page.getByText("Pizza night")).toBeVisible()
    await expect(page.getByText("$48.00").first()).toBeVisible()

    await dinnerNav(page).getByRole("link", { name: "Settle" }).click()
    await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible()
    await expect(page.getByText("$16.00").first()).toBeVisible()
    await expect(page.getByText("Ben pays you")).toBeVisible()
    await expect(page.getByText("Cam pays you")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Yours" })).toBeVisible()
    await page
      .getByRole("button", { name: /paid me/ })
      .first()
      .click()
    await expect(page.getByText("Payment recorded")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Paid" })).toBeVisible()
    await expect(page.getByRole("button", { name: /paid me/ })).toHaveCount(1)

    await dinnerNav(page).getByRole("link", { name: "Home" }).click()
    await startManualCheck(page)
    await page.getByLabel("Place").fill("Panchimalco")
    await addCheckItem(page, "Pupusa Frijol", "6.75", 3)
    await assignQuantities(page, "Pupusa Frijol", {
      Ana: 1,
      Ben: 1,
      Cam: 1,
    })
    await confirmCheck(page)
    await expect(page.getByText("Panchimalco")).toBeVisible()

    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await guestPage.goto("/?stay=true&tab=join")
    await waitForHydration(guestPage)
    await guestPage.getByRole("tab", { name: "Join" }).click()
    await guestPage.getByLabel("Code", { exact: true }).fill(dinnerCode)
    await expect(guestPage.getByText(dinnerName)).toBeVisible()
    await guestPage.getByRole("button", { name: /add my name/i }).click()
    await guestPage.getByLabel("Your name").fill("Dee")
    await guestPage.getByRole("button", { name: "Continue" }).click()
    await expect(
      guestPage.getByRole("heading", { name: dinnerName })
    ).toBeVisible()
    await expect(guestPage.getByText("You · Dee")).toBeVisible()
    await guest.close()
  })

  test("dinner create seats people inline and remembers defaults", async ({
    page,
  }) => {
    await openLanding(page)
    const dinnerChip = page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: "Dinner" })
    await dinnerChip.click()
    await expect(dinnerChip).toHaveAttribute("aria-pressed", "true")
    await page.getByLabel("Your name").fill("Ana")
    const guests = page.getByLabel("Who else is at the table?")
    await guests.fill("Ben, Cam")
    await guests.press("Enter")
    await expect(page.getByRole("button", { name: "Remove Cam" })).toBeVisible()
    await page.getByRole("button", { name: "Create dinner" }).click()
    await expect(page.getByText("Dinner ready")).toBeVisible()
    await page.getByRole("button", { name: "Continue to dinner" }).click()
    await expect(
      page.getByRole("heading", { name: /(breakfast|lunch|dinner)$/ })
    ).toBeVisible()
    await expect(page.getByText("3 people")).toBeVisible()
    await expect(page.getByText("You · Ana")).toBeVisible()

    await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(
      page.getByRole("group", { name: "Mode" }).getByRole("button", {
        name: "Dinner",
      })
    ).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByLabel("Your name")).toHaveValue("Ana")
  })

  test("trip create still requires two members", async ({ page }) => {
    await openLanding(page)
    const tripChip = page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", {
        name: "Trip",
      })
    await tripChip.click()
    await expect(tripChip).toHaveAttribute("aria-pressed", "true")
    await page.getByLabel("Trip name").fill("Weekend")
    await page.getByRole("button", { name: "Create trip" }).click()
    await expect(page.getByText("Add at least two members")).toBeVisible()
  })
})

test("manual service fee can be a percent of items", async ({ page }) => {
  await createDinner(page, `Service fee ${Date.now()}`, "Ana")
  await startManualCheck(page)
  await addCheckItem(page, "Taco", "20.00")
  await page
    .getByRole("button", { name: "Add a fee or service charge" })
    .click()
  await page.getByLabel("Add fee").fill("Service")
  await page.getByRole("button", { name: "Fee as percent" }).click()
  await expect(
    page.getByRole("button", { name: "Fee as percent" })
  ).toHaveAttribute("aria-pressed", "true")
  await page.getByLabel("Fee percent").fill("10")
  await expect(page.getByText("Adds $2.00")).toBeVisible()
  await page.getByRole("button", { name: "Add fee" }).click()
  await expect(page.getByText("Service · 10%")).toBeVisible()
  await expect(page.locator("main")).toContainText("$22.00")
})

test("new check offers camera and gallery", async ({ page }) => {
  await createDinner(page, `Gallery pick ${Date.now()}`, "Ana")
  await page.getByRole("link", { name: "Scan ticket" }).click()
  await waitForHydration(page)
  await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible()
  await expect(page.getByRole("button", { name: "From gallery" })).toBeVisible()
  await expect(page.getByTestId("ticket-camera-input")).toHaveAttribute(
    "capture",
    "environment"
  )
  await expect(page.getByTestId("ticket-gallery-input")).not.toHaveAttribute(
    "capture"
  )
})

test("OCR review when OpenAI is configured", async ({ page }) => {
  test.skip(
    !process.env.OPENAI_API_KEY || !existsSync(TICKET_PATH),
    "OPENAI_API_KEY or ticket fixture is missing"
  )

  const name = `Biblioteca OCR ${Date.now()}`
  await createDinner(page, name, "Ana")
  await page.getByRole("link", { name: "Scan ticket" }).click()
  await expect(page.getByRole("button", { name: "Take photo" })).toBeVisible()
  await expect(page.getByRole("button", { name: "From gallery" })).toBeVisible()
  await page.getByTestId("ticket-gallery-input").setInputFiles(TICKET_PATH)
  await expect(page.getByText("Continue to assign")).toBeVisible({
    timeout: 40_000,
  })
  await expect(page.getByText(/POLLO CHIPOTLE/i).first()).toBeVisible()
  await expect(page.getByText(/ONZ/i).first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Tip" }).first()).toBeVisible()
  await page.getByRole("button", { name: "Continue to assign" }).click()
  await expect(
    page.getByRole("button", { name: "Confirm check" })
  ).toBeDisabled()
})
