import { expect, test } from "@playwright/test"

import { goHome, skipCookieBanner, waitForHydration } from "./dinner-helpers"
import { addHouseCharge, createHouse } from "./house-helpers"

test.describe("House home row", () => {
  test("two houses show their own balances and stay out of To settle", async ({
    page,
  }) => {
    const stamp = Date.now().toString(36)
    const userId = `user_e2e_homerow_${stamp}`
    const owing = `Casa Owing ${stamp}`
    const square = `Casa Square ${stamp}`

    await createHouse(page, {
      houseName: owing,
      creator: "Walter",
      housemates: ["Ana"],
      userId,
    })
    await addHouseCharge(page, { title: "Rent", amountDigits: "28400" })
    await goHome(page)

    const yours = page.getByRole("region", { name: "Your bills and trips" })
    const owingRow = yours.getByRole("button", { name: `Open ${owing}` })
    await expect(owingRow.getByText("House")).toBeVisible()
    await expect(owingRow.getByText("You get back $142.00")).toBeVisible()
    await expect(page.getByTestId("to-settle-card")).toHaveCount(0)

    await createHouse(page, {
      houseName: square,
      creator: "Walter",
      userId,
    })
    await goHome(page)

    const squareRow = yours.getByRole("button", { name: `Open ${square}` })
    await expect(owingRow.getByText("You get back $142.00")).toBeVisible()
    await expect(squareRow.getByText("Square", { exact: true })).toBeVisible()
    await expect(yours.getByText("You get back $284.00")).toHaveCount(0)
    await expect(page.getByTestId("to-settle-card")).toHaveCount(0)
  })

  test("a signed-out housemate sees Sign in to see your balance on Recent", async ({
    page,
    context,
  }) => {
    const stamp = Date.now().toString(36)
    const houseName = `Casa Recent ${stamp}`
    await createHouse(page, {
      houseName,
      creator: "Walter",
      housemates: ["Ana"],
      userId: `user_e2e_recent_${stamp}`,
    })
    await addHouseCharge(page, { title: "Rent", amountDigits: "28400" })
    const code = new URL(page.url()).pathname.split("/")[2] ?? ""
    const memberId = await page.evaluate(
      (roomCode) =>
        window.localStorage.getItem(`split:member:${roomCode.toUpperCase()}`),
      code
    )
    expect(memberId).toBeTruthy()
    const recent = await page.evaluate(() =>
      window.localStorage.getItem("split:recent-trips")
    )
    expect(recent).toBeTruthy()

    const guest = await context.browser()?.newContext()
    if (!guest) throw new Error("no browser")
    const guestPage = await guest.newPage()
    await skipCookieBanner(guestPage)
    await guestPage.addInitScript(
      ({ trips, key, value }) => {
        window.localStorage.setItem("split:recent-trips", trips)
        window.localStorage.setItem(key, value)
      },
      {
        trips: recent ?? "[]",
        key: `split:member:${code.toUpperCase()}`,
        value: memberId ?? "",
      }
    )
    await guestPage.goto("/?stay=true", { waitUntil: "domcontentloaded" })
    await waitForHydration(guestPage)
    const recentList = guestPage.getByRole("region", { name: "Recent trips" })
    await expect(recentList.getByText(houseName)).toBeVisible()
    await expect(
      recentList.getByText("Sign in to see your balance")
    ).toBeVisible()
    await expect(recentList.getByText("You get back $142.00")).toHaveCount(0)
    await guest.close()
  })
})
