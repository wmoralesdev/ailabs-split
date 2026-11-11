import { expect, test, type Locator, type Page } from "@playwright/test"
import { mkdirSync } from "node:fs"
import path from "node:path"

import {
  addCheckItem,
  addPeople,
  openBill,
  openDinnerCreate,
  openLanding,
  waitForHydration,
} from "./dinner-helpers"

const SHOTS =
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/button-hover"

type Paint = {
  bg: string
  color: string
  deco: string
  shadow: string
  transform: string
  opacity: string
}

async function paint(locator: Locator): Promise<Paint> {
  return locator.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      bg: s.backgroundColor,
      color: s.color,
      deco: s.textDecorationLine,
      shadow: s.boxShadow,
      transform: s.transform,
      opacity: s.opacity,
    }
  })
}

function changed(a: Paint, b: Paint): boolean {
  return (
    a.bg !== b.bg ||
    a.color !== b.color ||
    a.deco !== b.deco ||
    a.shadow !== b.shadow ||
    a.transform !== b.transform ||
    a.opacity !== b.opacity
  )
}

async function shot(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({
    path: path.join(SHOTS, `${name}.png`),
    animations: "disabled",
  })
}

async function hoverShot(page: Page, locator: Locator, name: string) {
  await locator.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  await page.waitForTimeout(60)
  const restPaint = await paint(locator)
  await shot(page, `${name}-rest`)
  await locator.hover()
  await page.waitForTimeout(100)
  const hoverPaint = await paint(locator)
  await shot(page, `${name}-hover`)
  expect(changed(restPaint, hoverPaint), `hover did nothing on ${name}`).toBe(
    true
  )
  await page.mouse.move(0, 0)
}

test.describe.configure({ mode: "serial" })

test("landing and dinner controls show hover and focus-visible", async ({
  page,
}) => {
  mkdirSync(SHOTS, { recursive: true })
  await openDinnerCreate(page)
  await page.getByLabel("Your name").fill("Ana")

  await hoverShot(
    page,
    page.getByRole("button", { name: "Scan ticket" }),
    "01-scan-ticket"
  )
  await hoverShot(
    page,
    page.getByRole("button", { name: "From gallery" }),
    "02-from-gallery"
  )
  await hoverShot(
    page,
    page.getByRole("button", { name: "Create without a ticket" }),
    "03-create-without-ticket"
  )
  await hoverShot(page, page.getByRole("tab", { name: "Join" }), "04-join-tab")
  await hoverShot(
    page,
    page
      .getByRole("group", { name: "Mode" })
      .getByRole("button", { name: /Trip/ }),
    "05-mode-trip"
  )

  await page.getByLabel("Your name").click()
  await page.keyboard.press("Tab")
  await expect(page.locator(":focus-visible")).toHaveCount(1)
  await shot(page, "14-focus-visible-after-name")

  await page.getByRole("button", { name: "Create without a ticket" }).click()
  await expect(page.getByText("You · Ana")).toBeVisible()

  await hoverShot(
    page,
    page.getByRole("link", { name: "Enter items by hand" }),
    "06-enter-items"
  )
  await hoverShot(
    page,
    page.getByRole("link", { name: "Open the bill" }),
    "07-open-bill"
  )
  await hoverShot(
    page,
    page
      .getByRole("navigation", { name: "Bill navigation" })
      .getByRole("link", { name: "Settle" }),
    "08-nav-settle"
  )

  await openBill(page)
  await addPeople(page, ["Ben"])
  await addCheckItem(page, "Taco", "8.00")
  await hoverShot(
    page,
    page
      .getByRole("listitem")
      .filter({ hasText: "Taco" })
      .getByRole("button", { name: "Ben", exact: true }),
    "09-person-chip"
  )
  await hoverShot(
    page,
    page.getByRole("button", { name: "Assign rest to me" }),
    "10-assign-rest"
  )
  await hoverShot(
    page,
    page.getByRole("button", { name: "Save draft for later" }),
    "11-save-draft"
  )

  await page.goto("/?stay=true", { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  const tripChip = page
    .getByRole("group", { name: "Mode" })
    .getByRole("button", { name: /Trip/ })
  await tripChip.click()
  await expect(tripChip).toHaveAttribute("aria-pressed", "true")
  await hoverShot(
    page,
    page.getByRole("button", { name: "Create trip" }),
    "12-create-trip"
  )
  await hoverShot(
    page,
    page.getByRole("button", { name: "CRC", exact: true }),
    "13-currency-chip"
  )
})

test("every visible control on landing answers a real mouse hover", async ({
  page,
}) => {
  await openLanding(page)
  const tripChip = page
    .getByRole("group", { name: "Mode" })
    .getByRole("button", { name: /Trip/ })
  if ((await tripChip.getAttribute("aria-pressed")) !== "true") {
    await tripChip.click()
  }
  await expect(page.getByRole("button", { name: "Create trip" })).toBeVisible()

  const locators = page.locator(
    "button:visible, a[href]:visible, [role='tab']:visible"
  )
  const count = await locators.count()
  const fails: string[] = []
  for (let i = 0; i < count; i += 1) {
    const locator = locators.nth(i)
    if (await locator.isDisabled()) continue
    const tag = await locator.evaluate((el) => el.tagName)
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") continue
    const restPaint = await paint(locator)
    await locator.hover()
    await page.waitForTimeout(80)
    const hoverPaint = await paint(locator)
    await page.mouse.move(0, 0)
    if (!changed(restPaint, hoverPaint)) {
      fails.push(
        (await locator.getAttribute("aria-label")) ||
          ((await locator.textContent()) ?? "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 48)
      )
    }
  }
  expect(fails, fails.join(" | ")).toEqual([])
})
