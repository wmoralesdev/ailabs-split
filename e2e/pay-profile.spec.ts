import { copyFileSync, existsSync, mkdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { expect, test } from "@playwright/test"
import type { Browser, Page } from "@playwright/test"

import {
  addCheckItem,
  addPeople,
  assignEqual,
  confirmCheck,
  createDinner,
  createDinnerFromHome,
  goHome,
  openBill,
  openPersonSheet,
  signInE2e,
  waitForHydration,
} from "./dinner-helpers"
import { addHouseCharge, createHouse } from "./house-helpers"

const SHOTS_DIR =
  process.env.SHOTS_DIR ??
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/pay-profile"

const WALTER_ACCOUNT = "CR05 0152 0200 1026 2840 66"
const ANA_ACCOUNT = "CR21 0107 0000 0012 3456 78"

async function shot(page: Page, name: string, { keepToast = false } = {}) {
  mkdirSync(SHOTS_DIR, { recursive: true })
  if (!keepToast) {
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, {
      timeout: 10_000,
    })
  }
  const dest = path.join(SHOTS_DIR, name)
  const tmp = path.join(os.tmpdir(), `pay-profile-${name}`)
  await page.screenshot({ path: tmp, animations: "disabled" })
  try {
    copyFileSync(tmp, dest)
  } catch (error) {
    if (!existsSync(dest)) throw error
  }
}

async function newPage(browser: Browser, scheme: "light" | "dark") {
  const context = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    permissions: ["clipboard-read", "clipboard-write"],
  })
  const page = await context.newPage()
  await page.addInitScript((value) => {
    window.localStorage.setItem("split-theme", value)
  }, scheme)
  return page
}

async function fillPaySheet(
  page: Page,
  input: {
    name: string
    account: string
    bank?: string
    type?: "Savings" | "Checking"
  }
) {
  const sheet = page.getByRole("dialog")
  await expect(sheet.getByText("Pay details")).toBeVisible()
  await expect(sheet.getByRole("heading", { name: input.name })).toBeVisible()
  await sheet.getByLabel("Account number").fill(input.account)
  if (input.bank) await sheet.getByLabel(/Bank/).fill(input.bank)
  if (input.type) {
    const chip = sheet
      .getByRole("group", { name: "Account type" })
      .getByRole("button", { name: input.type, exact: true })
    await chip.click()
    await expect(chip).toHaveAttribute("aria-pressed", "true")
  }
  await expect(sheet).toHaveCSS("opacity", "1")
  return sheet
}

async function savePaySheet(page: Page) {
  const sheet = page.getByRole("dialog")
  await sheet.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Account saved")).toBeVisible()
  await expect(sheet).toBeHidden()
}

async function clipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText())
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`pay profile (${scheme})`, () => {
    test("a bill guest's number is added from the person and copied on pay", async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      const page = await newPage(browser, scheme)
      await signInE2e(page, {
        displayName: "Ana",
        userId: `user_e2e_pay_${scheme}_${Date.now().toString(36)}`,
      })
      const { code } = await createDinner(page, "Ana")

      await openBill(page)
      await addPeople(page, ["Walter"])
      const person = await openPersonSheet(page, "Walter")
      await person.getByRole("button", { name: /Account number/ }).click()
      await fillPaySheet(page, {
        name: "Walter",
        account: WALTER_ACCOUNT,
        bank: "BAC",
        type: "Savings",
      })
      await expect(page.getByText("Only on this bill.")).toBeVisible()
      await shot(page, `${scheme}-profile-edit.png`)
      await savePaySheet(page)

      const paidBy = page.getByRole("group", { name: "Paid by" })
      await paidBy.getByRole("button", { name: "Walter", exact: true }).click()
      await addCheckItem(page, "Casado", "24.00")
      await assignEqual(page, "Casado", ["Ana", "Walter"])
      await confirmCheck(page)

      await page.goto(`/r/${code}`, { waitUntil: "domcontentloaded" })
      await waitForHydration(page)
      await expect(page.getByText("You owe $12.00")).toBeVisible()
      const homeCopy = page.getByRole("button", {
        name: `Copy Walter's account number ${WALTER_ACCOUNT}`,
      })
      await expect(homeCopy).toBeVisible()
      await expect(homeCopy).toContainText("BAC · Savings")
      await shot(page, `${scheme}-bill-home-pay.png`)

      await page.getByRole("link", { name: "Pay and mark it done" }).click()
      await expect(
        page.getByRole("heading", { name: "Settle up" })
      ).toBeVisible()
      const payCopy = page.getByRole("button", {
        name: `Copy Walter's account number ${WALTER_ACCOUNT}`,
      })
      await expect(payCopy).toBeVisible()
      await expect(
        page.getByText("BAC · Savings", { exact: true })
      ).toBeVisible()
      await shot(page, `${scheme}-pay-with-copy.png`)

      await payCopy.click()
      await expect(
        page.getByText("Walter's account number copied")
      ).toBeVisible()
      await expect(payCopy).toContainText("Copied")
      expect(await clipboard(page)).toBe(WALTER_ACCOUNT)
      await shot(page, `${scheme}-pay-copied.png`, { keepToast: true })
      await page.context().close()
    })

    test("a signed-in number follows you into your next bill", async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      const page = await newPage(browser, scheme)
      await signInE2e(page, {
        displayName: "Ana",
        userId: `user_e2e_pay_self_${scheme}_${Date.now().toString(36)}`,
      })
      await createDinner(page, "Ana")
      await page.getByRole("button", { name: /You · Ana/ }).click()
      await fillPaySheet(page, {
        name: "Ana (you)",
        account: ANA_ACCOUNT,
        bank: "BCR",
        type: "Checking",
      })
      await expect(page.getByText(/Saved to your account/)).toBeVisible()
      await shot(page, `${scheme}-my-profile-edit.png`)
      await savePaySheet(page)
      await expect(
        page.getByText(`BCR · Checking · ${ANA_ACCOUNT}`)
      ).toBeVisible()

      await goHome(page)
      await createDinnerFromHome(page, "Ana")
      await expect(
        page.getByText(`BCR · Checking · ${ANA_ACCOUNT}`)
      ).toBeVisible()
      await page.context().close()
    })

    test("house settle shows the payee's number with copy", async ({
      browser,
    }) => {
      test.setTimeout(120_000)
      const page = await newPage(browser, scheme)
      await createHouse(page, {
        houseName: scheme === "light" ? "Casa Pago" : "Casa Cuenta",
        creator: "Walter",
        housemates: ["Ana"],
        userId: `user_e2e_pay_house_${scheme}_${Date.now().toString(36)}`,
      })
      await addHouseCharge(page, { title: "Rent", amountDigits: "80000" })

      await page.getByRole("link", { name: "Settle", exact: true }).click()
      await expect(
        page.getByRole("heading", { name: "Settle up" })
      ).toBeVisible()
      await page
        .getByRole("button", { name: "Add your account number" })
        .click()
      await fillPaySheet(page, {
        name: "Walter (you)",
        account: WALTER_ACCOUNT,
        bank: "BAC",
        type: "Savings",
      })
      await savePaySheet(page)
      const copy = page.getByRole("button", {
        name: `Copy your account number ${WALTER_ACCOUNT}`,
      })
      await expect(copy).toBeVisible()
      await expect(copy).toContainText("BAC · Savings")
      await shot(page, `${scheme}-house-settle-pay.png`)
      await copy.click()
      expect(await clipboard(page)).toBe(WALTER_ACCOUNT)
      await page.context().close()
    })
  })
}
