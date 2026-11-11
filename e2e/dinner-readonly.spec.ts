import { expect, test } from "@playwright/test"
import { mkdirSync } from "node:fs"
import path from "node:path"

import {
  addCheckItem,
  addPeople,
  assignEqual,
  confirmCheck,
  createDinner,
  dinnerNav,
  joinDinner,
  openBill,
  signInE2e,
  waitForHydration,
} from "./dinner-helpers"

const SHOTS = "/cursor/stores/self/media/dinner-readonly"

test.describe.configure({ mode: "serial" })

test.describe("dinner read-only for non-creators", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  test("guest cannot edit the dinner or an item; owes nothing is not $0.00", async ({
    page,
    browser,
  }) => {
    mkdirSync(SHOTS, { recursive: true })
    const shot = (
      target: {
        screenshot: (opts: {
          path: string
          animations: "disabled"
        }) => Promise<unknown>
      },
      name: string
    ) =>
      target.screenshot({
        path: path.join(SHOTS, name),
        animations: "disabled",
      })

    await signInE2e(page, {
      userId: "user_e2e_dinner_host",
      displayName: "Ana",
    })
    const { code, name: dinnerName } = await createDinner(page, "Ana")
    await openBill(page)
    await addPeople(page, ["Ben", "Cam"])
    await page.getByLabel("Place").fill("Pizza night")
    await addCheckItem(page, "Pizza Margherita", "24.00")
    await assignEqual(page, "Pizza Margherita", ["Ana", "Ben"])

    const main = page.locator("main")
    await expect(main.getByRole("heading", { name: "By person" })).toBeVisible()
    const camShare = main
      .getByRole("listitem")
      .filter({
        has: page.getByText("Cam", { exact: true }),
      })
      .filter({ hasText: "Nothing" })
    await expect(camShare.first()).toBeVisible()
    await expect(main.getByText("$0.00")).toHaveCount(0)
    await expect(main.getByText("$12.00").first()).toBeVisible()
    await main
      .getByRole("heading", { name: "By person" })
      .scrollIntoViewIfNeeded()
    await shot(page, "owner-by-person-nothing.png")

    await confirmCheck(page)
    await expect(page.getByRole("heading", { name: dinnerName })).toBeVisible()
    await expect(page.getByText("Bill confirmed")).toHaveCount(0)
    await expect(page.getByText("You get back $12.00")).toBeVisible()
    const people = page.getByRole("list", { name: "At the table" })
    await expect(people.getByText("Nothing")).toBeVisible()
    await expect(people.getByText("$0.00")).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: `Rename ${dinnerName}` })
    ).toBeVisible()
    await shot(page, "owner-home.png")

    await openBill(page)
    await expect(page.getByLabel("Add people")).toBeVisible()
    await expect(page.getByRole("button", { name: "Add item" })).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Delete this bill" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Confirm bill" })
    ).toBeVisible()
    await shot(page, "owner-bill-edit.png")
    await page.getByRole("button", { name: "Back", exact: true }).click()

    const guest = await browser.newContext()
    const guestPage = await guest.newPage()
    await joinDinner(guestPage, code, "Cam", true)
    await waitForHydration(guestPage)
    await expect(
      guestPage.getByRole("heading", { name: dinnerName })
    ).toBeVisible()
    await expect(guestPage.getByText(/Joined /)).toHaveCount(0)
    await expect(
      guestPage.getByRole("button", { name: `Rename ${dinnerName}` })
    ).toHaveCount(0)
    await expect(guestPage.getByText("You owe nothing")).toBeVisible()
    await expect(guestPage.getByText("$0.00")).toHaveCount(0)
    await expect(guestPage.getByLabel("Scan ticket")).toHaveCount(0)
    await expect(
      guestPage.getByRole("button", { name: "From gallery" })
    ).toHaveCount(0)
    await expect(
      guestPage.getByRole("link", { name: "Enter items by hand" })
    ).toHaveCount(0)
    const guestPeople = guestPage.getByRole("list", { name: "At the table" })
    await expect(
      guestPeople.getByRole("listitem").filter({ hasText: "Cam" })
    ).toContainText("Nothing")
    await expect(guestPeople.getByText("$0.00")).toHaveCount(0)
    await shot(guestPage, "guest-home-readonly.png")

    await dinnerNav(guestPage)
      .getByRole("link", { name: "Open the bill" })
      .click()
    await waitForHydration(guestPage)
    await expect(guestPage.getByText("Pizza night")).toBeVisible()
    await expect(guestPage.getByLabel("Add people")).toHaveCount(0)
    await expect(
      guestPage.getByRole("button", { name: "Add item" })
    ).toHaveCount(0)
    await expect(
      guestPage.getByRole("button", { name: "Delete this bill" })
    ).toHaveCount(0)
    await expect(
      guestPage.getByRole("button", { name: "Hide this bill" })
    ).toBeVisible()
    await expect(
      guestPage.getByRole("button", { name: "Confirm bill" })
    ).toHaveCount(0)
    await expect(guestPage.getByTestId("ticket-gallery-input")).toHaveCount(0)
    await expect(guestPage.getByText("Nothing").first()).toBeVisible()
    await expect(guestPage.getByText("$0.00")).toHaveCount(0)
    await shot(guestPage, "guest-bill-readonly.png")

    await guestPage.getByRole("button", { name: /Pizza Margherita/ }).click()
    const sheet = guestPage.getByRole("dialog")
    await expect(sheet.getByText("This item")).toBeVisible()
    await expect(sheet.getByRole("button", { name: "Save item" })).toHaveCount(
      0
    )
    await expect(sheet.getByText("Edit item")).toHaveCount(0)
    await expect(sheet.getByText("Nothing")).toBeVisible()
    await expect(sheet.getByText("$0.00")).toHaveCount(0)
    await shot(guestPage, "guest-item-readonly.png")
    await guest.close()
  })
})
