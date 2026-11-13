import { expect, test } from "@playwright/test"

import {
  addHouseCharge,
  createHouse,
  openHouseGate,
  setHouseMovedIn,
} from "./house-helpers"
import { signInE2e, skipCookieBanner, waitForHydration } from "./dinner-helpers"
import {
  addMonths,
  formatDay,
  formatMonth,
  localIsoDate,
  monthKey,
  monthStart,
} from "../src/lib/house-month"

test.describe("House charges", () => {
  test("a guest does not get an add button", async ({ page, context }) => {
    const { code } = await createHouse(page, {
      houseName: "Casa Charge Guest",
      creator: "Walter",
      housemates: ["Ana"],
    })
    const guest = await context.browser()?.newContext()
    if (!guest) throw new Error("no browser")
    const guestPage = await guest.newPage()
    await openHouseGate(guestPage, code)
    await guestPage.getByRole("button", { name: "Join as a guest" }).click()
    await guestPage.getByLabel("Your name").fill("Sofi")
    await guestPage.getByRole("button", { name: "Join as a guest" }).click()
    await expect(
      guestPage.getByRole("heading", { name: "Casa Charge Guest" })
    ).toBeVisible()
    await expect(
      guestPage.getByRole("link", { name: "Add charge" })
    ).toHaveCount(0)
    await guest.close()
  })

  test("period can differ from the paid-on day", async ({ page }) => {
    await createHouse(page, {
      houseName: "Casa Charge Period",
      creator: "Walter",
      housemates: ["Ana"],
    })
    const last = addMonths(monthKey(), -1)
    await setHouseMovedIn(page, ["Walter", "Ana"], monthStart(last))
    await addHouseCharge(page, {
      title: "CAESS",
      amountDigits: "1000",
      previousMonth: true,
    })
    await expect(
      page.getByRole("heading", { name: formatMonth(last) })
    ).toBeVisible()
    await expect(page.getByText("CAESS")).toBeVisible()
    await expect(
      page.getByText(
        new RegExp(`Paid by Walter · ${formatDay(localIsoDate())}`)
      )
    ).toBeVisible()
  })

  test("a housemate cannot edit someone else's charge; the owner can", async ({
    page,
    context,
  }) => {
    const { code } = await createHouse(page, {
      houseName: "Casa Charge Edit",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await addHouseCharge(page, { title: "Internet", amountDigits: "4000" })
    await page.getByRole("button", { name: /Internet/ }).click()
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible()
    await page.keyboard.press("Escape")

    const other = await context.browser()?.newContext()
    if (!other) throw new Error("no browser")
    const anaPage = await other.newPage()
    await signInE2e(anaPage, { displayName: "Ana" })
    await skipCookieBanner(anaPage)
    await anaPage.goto(`/r/${code}`, { waitUntil: "domcontentloaded" })
    await waitForHydration(anaPage)
    await expect(
      anaPage.getByRole("heading", { name: "Who are you?" })
    ).toBeVisible()
    await anaPage.getByRole("button", { name: /Ana/ }).click()
    await expect(
      anaPage.getByRole("heading", { name: "Casa Charge Edit" })
    ).toBeVisible()
    await anaPage.getByRole("button", { name: /Internet/ }).click()
    await expect(anaPage.getByRole("button", { name: "Edit" })).toHaveCount(0)
    await other.close()
  })

  test("someone with charges cannot be removed", async ({ page }) => {
    await createHouse(page, {
      houseName: "Casa Charge Keep",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await addHouseCharge(page, { title: "Rent", amountDigits: "90000" })
    await page.getByRole("link", { name: "People" }).click()
    await page.getByRole("button", { name: /Ana/ }).click()
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0)
  })
})
