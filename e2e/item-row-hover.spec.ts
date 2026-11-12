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
const FIRST_SHOTS = "/cursor/stores/self/media/everyone-first"

const GUESTS = ["Borea", "Freddy", "Gabriel", "Hector", "Ro", "Saul"]

function shot(page: Page, name: string, locator?: Locator, dir = SHOTS) {
  mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, name)
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
  mkdirSync(FIRST_SHOTS, { recursive: true })
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
  const firstAssign = first.locator(".item-row-assign")
  const firstChips = first.locator(".item-row-chips")
  const lastChips = last.locator(".item-row-chips")
  const firstChipButtons = firstChips.getByRole("button")
  const lastEveryone = lastChips.getByRole("button", {
    name: "Everyone",
    exact: true,
  })
  const firstEveryone = firstChips.getByRole("button", {
    name: "Everyone",
    exact: true,
  })
  const boreaChip = firstChips.getByRole("button", {
    name: "Borea",
    exact: true,
  })

  await expect(firstEveryone).toHaveCount(1)
  await expect(lastEveryone).toHaveCount(1)
  await expect(firstChipButtons.first()).toHaveText("Everyone")
  await expect(firstChipButtons.last()).not.toHaveText("Everyone")
  await expect(firstChipButtons).toHaveCount(1 + GUESTS.length + 1)
  await expect(firstChips).toHaveCSS("flex-wrap", "nowrap")
  const chipsBox = await firstChips.boundingBox()
  expect(chipsBox?.height ?? 0, "chip row should be one line").toBeLessThan(56)

  const everyonePaint = await paint(firstEveryone)
  const personPaint = await paint(boreaChip)
  const accentPaint = await paint(
    page.getByRole("button", { name: "Confirm bill" })
  )
  expect(everyonePaint.bg).not.toBe(personPaint.bg)
  await expect(firstEveryone).toHaveCSS("color", accentPaint.bg)

  await page.locator(".item-row-chips").evaluateAll((els) => {
    for (const el of els) el.scrollLeft = 0
  })
  await expect(firstAssign).toHaveAttribute("data-scroll-right", "")
  await expect(firstAssign).not.toHaveAttribute("data-scroll-left")
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
  await shot(page, "everyone-accent.png", itemsList)
  await shot(page, "scroll-right.png", firstAssign)
  await shot(page, "390-chips-start.png", firstChips)
  await shot(page, "row-start.png", firstAssign, FIRST_SHOTS)
  await firstChips.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  await expect(firstAssign).toHaveAttribute("data-scroll-left", "")
  await page.waitForTimeout(80)
  await shot(page, "scroll-left.png", firstAssign)
  await shot(page, "390-chips-end.png", firstChips)
  await shot(page, "scroll-end.png", firstAssign, FIRST_SHOTS)
  await shot(page, "390-items-end.png", itemsList)
  await firstChips.evaluate((el) => {
    el.scrollLeft = 0
  })
  await expect(firstAssign).toHaveAttribute("data-scroll-right", "")
  await expect(firstAssign).not.toHaveAttribute("data-scroll-left")

  const textOnly = await page.addStyleTag({
    content: `
      :is(.surface, .group-list) .person-chip-everyone:not([aria-pressed="true"]) {
        background-color: var(--muted) !important;
        color: var(--primary) !important;
      }
    `,
  })
  await page.waitForTimeout(40)
  await shot(page, "everyone-accent-text.png", itemsList)
  await textOnly.evaluate((el) => {
    if (el instanceof HTMLElement) el.remove()
  })

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
  await page.locator(".item-row-chips").evaluateAll((els) => {
    for (const el of els) el.scrollLeft = 0
  })
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

  await lastEveryone.click()
  await expect(lastEveryone).toHaveAttribute("aria-pressed", "true")
  await page.mouse.move(0, 0)
  await expect(lastEveryone).toHaveCSS("background-color", accentPaint.bg)
  const selectedPerson = await paint(
    last.getByRole("button", { name: "Walter", exact: true })
  )
  expect(selectedPerson.bg).not.toBe(accentPaint.bg)
  for (const name of ["Walter", ...GUESTS]) {
    await expect(
      last.getByRole("button", { name, exact: true })
    ).toHaveAttribute("aria-pressed", "true")
  }
  await last.hover()
  await page.waitForTimeout(120)
  await shot(page, "desktop-everyone.png", itemsList)

  await page.mouse.move(0, 0)
  await page.setViewportSize({ width: 390, height: 844 })
  await itemsList.scrollIntoViewIfNeeded()
  await page.locator(".item-row-chips").evaluateAll((els) => {
    for (const el of els) el.scrollLeft = 0
  })
  await shot(page, "390-everyone.png", itemsList)

  const themeBtn = page.getByRole("button", { name: /Theme:/ })
  for (let i = 0; i < 3; i++) {
    if (
      await page.locator("html").evaluate((el) => el.classList.contains("dark"))
    ) {
      break
    }
    await themeBtn.click()
  }
  await expect(page.locator("html")).toHaveClass(/dark/)
  await itemsList.scrollIntoViewIfNeeded()
  await page.locator(".item-row-chips").evaluateAll((els) => {
    for (const el of els) el.scrollLeft = 0
  })
  await page.mouse.move(0, 0)
  await page.waitForTimeout(80)
  await shot(page, "dark-everyone-accent.png", itemsList)
  await shot(page, "dark-scroll-right.png", firstAssign)
  await firstChips.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
  })
  await expect(firstAssign).toHaveAttribute("data-scroll-left", "")
  await page.waitForTimeout(80)
  await shot(page, "dark-scroll-left.png", firstAssign)
  await shot(page, "dark-390-items-end.png", itemsList)
  await firstChips.evaluate((el) => {
    el.scrollLeft = 0
  })
  await shot(page, "dark-390-everyone.png", itemsList)
})
