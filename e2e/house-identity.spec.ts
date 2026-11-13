import { expect, test } from "@playwright/test"

import {
  openLanding,
  signInE2e,
  skipCookieBanner,
  waitForHydration,
} from "./dinner-helpers"
import { createHouse, openHouseGate, pickHouseMode } from "./house-helpers"

test.describe("House identity", () => {
  test("creating a house needs a session", async ({ page }) => {
    await openLanding(page)
    await pickHouseMode(page)
    await expect(page.getByText("Sign in to start a house")).toBeVisible()
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible()
  })

  test("signed-in creator lands in an empty house", async ({ page }) => {
    const { code } = await createHouse(page, {
      houseName: "Casa Escalón",
      creator: "Walter",
      housemates: ["Ana"],
    })
    await expect(page.getByText("House ready")).toHaveCount(0)
    await expect(page.getByText(/House · 2 housemates/)).toBeVisible()
    await expect(page.getByText("You're square")).toBeVisible()
    await expect(page.getByText("No charges yet")).toBeVisible()
    expect(code.length).toBeGreaterThanOrEqual(6)
  })

  test("a guest cannot take a housemate name", async ({ page, context }) => {
    const { code } = await createHouse(page, {
      houseName: "Casa Ana",
      creator: "Walter",
      housemates: ["Ana"],
    })

    const guest = await context.browser()?.newContext()
    if (!guest) throw new Error("no browser")
    const guestPage = await guest.newPage()
    await openHouseGate(guestPage, code)
    await guestPage.getByRole("button", { name: "Join as a guest" }).click()
    await guestPage.getByLabel("Your name").fill("Ana")
    await guestPage.getByRole("button", { name: "Join as a guest" }).click()
    await expect(
      guestPage.getByText(
        "That name belongs to a housemate. Sign in to claim it."
      )
    ).toBeVisible()
    await guest.close()
  })

  test("the same user skips the gate on another phone", async ({
    page,
    context,
  }) => {
    const userId = await signInE2e(page, { displayName: "Walter" })
    const { code } = await createHouse(page, {
      houseName: "Casa Two Phones",
      creator: "Walter",
      userId,
    })

    const other = await context.browser()?.newContext()
    if (!other) throw new Error("no browser")
    const otherPage = await other.newPage()
    await signInE2e(otherPage, { userId, displayName: "Walter" })
    await skipCookieBanner(otherPage)
    await otherPage.goto(`/r/${code}`, { waitUntil: "domcontentloaded" })
    await waitForHydration(otherPage)
    await expect(
      otherPage.getByRole("heading", { name: "Casa Two Phones" })
    ).toBeVisible()
    await expect(
      otherPage.getByRole("heading", { name: "Who are you?" })
    ).toHaveCount(0)
    await other.close()
  })

  test("one user can belong to two houses", async ({ page }) => {
    const stamp = Date.now().toString(36)
    const uno = `Casa Uno ${stamp}`
    const dos = `Casa Dos ${stamp}`
    await createHouse(page, {
      houseName: uno,
      creator: "Walter",
      userId: `user_e2e_twohouses_${stamp}`,
    })
    await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await createHouse(page, {
      houseName: dos,
      creator: "Walter",
      userId: `user_e2e_twohouses_${stamp}`,
    })
    await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    const yours = page.getByRole("region", { name: "Your bills and trips" })
    await expect(yours.getByText(uno)).toBeVisible()
    await expect(yours.getByText(dos)).toBeVisible()
  })
})
