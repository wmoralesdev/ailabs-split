import { expect, test } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"
import { mkdirSync } from "node:fs"
import path from "node:path"

import {
  addCheckItem,
  addPeople,
  assignEqual,
  createDinner,
  itemCard,
  openBill,
} from "./dinner-helpers"

const SHOTS = "/cursor/stores/self/media/item-row-hover"

const GUESTS = ["Borea", "Freddy", "Gabriel", "Hector", "Ro", "Saul"]

function shot(page: Page, name: string, locator?: Locator) {
  mkdirSync(SHOTS, { recursive: true })
  const dest = path.join(SHOTS, name)
  if (locator) return locator.screenshot({ path: dest, animations: "disabled" })
  return page.screenshot({ path: dest, animations: "disabled" })
}

async function paint(locator: Locator) {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      bg: s.backgroundColor,
      border: s.borderTopColor,
      borderW: s.borderTopWidth,
      radius: s.borderTopLeftRadius,
      opacity: s.opacity,
    }
  })
}

test.describe.configure({ mode: "serial" })

test.use({ deviceScaleFactor: 2, viewport: { width: 390, height: 844 } })

test("item rows hover as a full rounded card; Paid by looks enabled", async ({
  page,
}) => {
  mkdirSync(SHOTS, { recursive: true })
  await createDinner(page, "Walter")
  await openBill(page)
  await addPeople(page, GUESTS)

  await addCheckItem(page, "Case Bateria Anker", "17.99", 5)
  await addCheckItem(page, "Case Audifonos", "18.99")
  await addCheckItem(page, "Case Moft", "29.99")

  await assignEqual(page, "Case Bateria Anker", [
    "Freddy",
    "Gabriel",
    "Hector",
    "Ro",
    "Saul",
  ])
  await assignEqual(page, "Case Audifonos", ["Ro"])
  await assignEqual(page, "Case Moft", ["Walter"])

  await expect(page.locator("select")).toHaveCount(0)

  const paidBy = page.getByRole("button", { name: /Paid by/ })
  const place = page.getByLabel("Place")
  await expect(paidBy).toBeVisible()
  await paidBy.scrollIntoViewIfNeeded()

  const paidPaint = await paint(paidBy)
  const placePaint = await paint(place)
  expect(paidPaint.opacity).toBe("1")
  expect(Number.parseFloat(paidPaint.borderW)).toBeGreaterThan(0)
  expect(paidPaint.bg).toBe(placePaint.bg)
  expect(paidPaint.border).toBe(placePaint.border)

  const itemsList = page
    .locator("ul.group-list")
    .filter({ hasText: "Case Bateria Anker" })
  await itemsList.scrollIntoViewIfNeeded()

  const first = itemCard(page, "Case Bateria Anker")
  const middle = itemCard(page, "Case Audifonos")
  const last = itemCard(page, "Case Moft")
  const everyone = last.getByRole("button", { name: "Everyone", exact: true })
  await expect(everyone).toHaveClass(/item-everyone/)
  await expect(everyone).not.toHaveClass(/person-chip/)

  await page.mouse.move(0, 0)
  await page.waitForTimeout(80)

  await page.getByRole("heading", { name: "People" }).scrollIntoViewIfNeeded()
  await shot(page, "390-people-paid-by.png")
  await itemsList.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  await page.waitForTimeout(80)

  await shot(page, "390-bill.png")
  await shot(page, "390-paid-by.png", paidBy)
  await shot(page, "390-items.png", itemsList)

  const title = first.locator(".item-row-main")
  const restRow = await paint(first)
  const restTitle = await paint(title)
  const firstBox = await first.boundingBox()
  const titleBox = await title.boundingBox()
  expect(firstBox?.height ?? 0).toBeGreaterThan((titleBox?.height ?? 0) + 24)

  await first.hover({ position: { x: 24, y: 16 } })
  await page.waitForTimeout(120)
  const hoverRow = await paint(first)
  const hoverTitle = await paint(title)
  expect(hoverRow.bg).not.toBe(restRow.bg)
  expect(hoverTitle.bg).toBe(restTitle.bg)
  await shot(page, "390-hover-first.png", itemsList)
  await page.mouse.move(0, 0)

  await page.setViewportSize({ width: 1280, height: 800 })
  await itemsList.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  await page.waitForTimeout(80)
  await shot(page, "desktop-items-rest.png", itemsList)
  await shot(page, "desktop-paid-by.png", paidBy)

  await first.hover({ position: { x: 24, y: 16 } })
  await page.waitForTimeout(120)
  await shot(page, "desktop-hover-first.png", itemsList)

  await middle.hover({ position: { x: 24, y: 16 } })
  await page.waitForTimeout(120)
  const middleHover = await paint(middle)
  expect(middleHover.bg).not.toBe(restRow.bg)
  await shot(page, "desktop-hover-middle.png", itemsList)

  await last.hover({ position: { x: 24, y: 16 } })
  await page.waitForTimeout(120)
  await shot(page, "desktop-hover-last.png", itemsList)
  await page.mouse.move(0, 0)

  await paidBy.click()
  await expect(page.getByRole("listbox")).toBeVisible()
  await expect(page.getByRole("option", { name: "Walter" })).toBeInViewport()
  await shot(page, "desktop-paid-by-open.png")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("listbox")).toHaveCount(0)

  await everyone.click()
  await expect(everyone).toHaveAttribute("aria-pressed", "true")
  for (const name of ["Walter", ...GUESTS]) {
    await expect(
      last.getByRole("button", { name, exact: true })
    ).toHaveAttribute("aria-pressed", "true")
  }
  await last.hover()
  await page.waitForTimeout(120)
  await shot(page, "desktop-everyone.png", itemsList)
})
