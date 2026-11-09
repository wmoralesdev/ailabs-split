import { chromium } from "@playwright/test"
import { mkdir, stat } from "node:fs/promises"
import path from "node:path"

const OUT =
  process.env.OUT ||
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/taste-v7"
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000"

async function waitForHydration(page) {
  await page.waitForFunction(() => {
    const nodes = document.querySelectorAll("button, a, input, [role='button']")
    for (const node of nodes) {
      for (const key of Object.keys(node)) {
        if (key.startsWith("__reactFiber")) return true
      }
    }
    return false
  })
}

const SCHEMES = (process.env.SCHEMES || "light,dark").split(",")

async function shot(page, name) {
  const file = path.join(OUT, name.replace(".png", `-${scheme}.png`))
  await page.screenshot({ path: file, fullPage: false, type: "png" })
  const info = await stat(file)
  if (info.size < 8_000) {
    throw new Error(`${file} looks empty (${info.size} bytes)`)
  }
  console.log("wrote", file, info.size)
}

/** Crop from the top of `from` to the bottom of `to`, full width, padded. */
async function closeup(page, name, from, to, pad = 12) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  if (!a || !b) throw new Error(`${name}: close-up target not visible`)
  const file = path.join(OUT, name.replace(".png", `-${scheme}.png`))
  const y = Math.max(0, a.y - pad)
  await page.screenshot({
    path: file,
    type: "png",
    clip: { x: 0, y, width: 390, height: b.y + b.height + pad - y },
  })
  const info = await stat(file)
  if (info.size < 4_000) {
    throw new Error(`${file} looks empty (${info.size} bytes)`)
  }
  console.log("wrote", file, info.size)
}

const browser = await chromium.launch()
await mkdir(OUT, { recursive: true })
let scheme = "light"

for (scheme of SCHEMES) {
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: scheme,
})
const page = await context.newPage()

await page.goto(`${BASE}/?stay=true`, { waitUntil: "domcontentloaded" })
await waitForHydration(page)
const dinnerChip = page
  .getByRole("group", { name: "Mode" })
  .getByRole("button", {
    name: "Dinner",
  })
await dinnerChip.click()
await page.getByRole("button", { name: "Create dinner" }).waitFor()
await page.getByLabel("Your name").fill("Ana")
const guests = page.getByLabel("Who else is at the table?")
await guests.fill("Ben, Cam")
await guests.press("Enter")
await page.getByLabel("Dinner name").fill("Friday pizzas")
await page.getByLabel("Dinner name").blur()
await page.waitForTimeout(200)
await shot(page, "dinner-landing.png")
await closeup(
  page,
  "closeup-inputs.png",
  page.getByText("Your name", { exact: true }),
  page.getByLabel("Dinner name")
)

const dinnerName = `Friday pizzas ${String(Date.now()).slice(-4)}`
await page.getByLabel("Dinner name").fill(dinnerName)
await page.getByRole("button", { name: "Create dinner" }).click()
const ready = page.getByRole("dialog")
await ready.getByText("Dinner ready").waitFor()
await page.waitForTimeout(400)
await shot(page, "dinner-created.png")

await ready.getByRole("button", { name: "Add the bill" }).click()
await waitForHydration(page)
await page.getByLabel("Place").waitFor()
await page.getByLabel("Place").fill("Pizza night")
for (const [name, price] of [
  ["Pizza Margherita", "24.00"],
  ["Pizza Pepperoni", "26.00"],
  ["Lemonade", "4.50"],
]) {
  await page.getByLabel("Item", { exact: true }).fill(name)
  await page.getByLabel("Price", { exact: true }).fill(price)
  await page.getByRole("button", { name: "Add item" }).click()
  await page.getByRole("button", { name: new RegExp(name) }).waitFor()
}
const card = (name) =>
  page.getByRole("listitem").filter({
    has: page.getByRole("button", { name: new RegExp(name) }),
  })
await card("Pizza Margherita").getByRole("button", { name: "Everyone" }).click()
await card("Lemonade").getByRole("button", { name: "Cam", exact: true }).click()
await page.evaluate(() => {
  const scroller = document.querySelector("[data-app-scroll]")
  if (scroller) scroller.scrollTop = 0
})
await page.waitForTimeout(200)
await shot(page, "dinner-check.png")
await page.evaluate(() => {
  const scroller = document.querySelector("[data-app-scroll]")
  if (scroller) scroller.scrollTop = scroller.scrollHeight
  else window.scrollTo(0, document.documentElement.scrollHeight)
})
await page.waitForTimeout(300)
await shot(page, "dinner-check-scrolled.png")
await page.locator("#custom-tip").scrollIntoViewIfNeeded()
await page.waitForTimeout(200)
await closeup(
  page,
  "closeup-tip-row.png",
  page.getByText("Tip and fees", { exact: true }),
  page.locator("#custom-tip")
)
await page.evaluate(() => {
  const scroller = document.querySelector("[data-app-scroll]")
  if (scroller) scroller.scrollTop = 0
  else window.scrollTo(0, 0)
})

await page.getByRole("button", { name: /Pizza Pepperoni/ }).click()
const split = page.getByRole("dialog")
await split.getByText("Split item").waitFor()
for (const person of ["Ana", "Ben"]) {
  await split
    .getByRole("listitem")
    .filter({ hasText: person })
    .getByRole("button")
    .filter({ hasText: person })
    .click()
}
await page.waitForTimeout(400)
await shot(page, "dinner-item-split.png")
await split.getByRole("button", { name: "Save item" }).click()
await split.waitFor({ state: "hidden" })

const confirm = page.getByRole("button", { name: "Confirm check" })
await confirm.click()
await page.getByRole("heading", { name: dinnerName }).waitFor()
await page.getByText("Confirmed").first().waitFor()
await page
  .getByText("Check confirmed")
  .waitFor({ state: "hidden", timeout: 8_000 })
  .catch(() => {})
await page.evaluate(() => {
  const scroller = document.querySelector("[data-app-scroll]")
  if (scroller) scroller.scrollTop = 0
  else window.scrollTo(0, 0)
})
await page.waitForTimeout(200)
await shot(page, "dinner-home.png")

await page
  .getByRole("navigation", { name: "Dinner navigation" })
  .getByRole("link", { name: "Settle" })
  .click()
await page.getByRole("heading", { name: "Settle up" }).waitFor()
await page.getByRole("button", { name: "Ben paid me" }).click()
await page.getByText("Payment recorded").waitFor()
await page.waitForTimeout(500)
await shot(page, "dinner-toast.png")
await page
  .getByText("Payment recorded")
  .waitFor({ state: "hidden", timeout: 10_000 })
  .catch(() => {})
await page.waitForTimeout(300)
await shot(page, "dinner-settle.png")

await page.goto(`${BASE}/?stay=true`, { waitUntil: "domcontentloaded" })
await waitForHydration(page)
await page
  .getByRole("group", { name: "Mode" })
  .getByRole("button", { name: "Trip" })
  .click()
await page.getByLabel("Trip name").fill("Beach weekend")
const members = page.getByLabel("Members")
for (const name of ["Ana", "Ben", "Cam"]) {
  await members.fill(name)
  await members.press("Enter")
}
await page.getByRole("button", { name: "Create trip" }).click()
const gate = page.getByRole("heading", { name: "Who are you?" })
const tripReady = page.getByRole("dialog").filter({ hasText: "Trip ready" })
await gate.or(tripReady).waitFor()
if (await tripReady.isVisible()) {
  await tripReady.getByRole("button", { name: "Continue to trip" }).click()
  await tripReady.waitFor({ state: "hidden" })
}
if (await gate.isVisible()) {
  await page.getByRole("button", { name: "Ana" }).click()
}
await page.getByRole("heading", { name: "Beach weekend" }).waitFor()
const tripUrl = page.url().replace(/\?.*$/, "")
await page.goto(`${tripUrl}/new`)
await waitForHydration(page)
await page.getByLabel("Amount").fill("9000")
await page.getByLabel("Title").fill("Airbnb")
await page.getByRole("button", { name: "Save expense" }).click()
await page.getByText("Expense added").waitFor()
await page
  .getByText("Expense added")
  .waitFor({ state: "hidden", timeout: 10_000 })
  .catch(() => {})
await page.waitForTimeout(300)
await shot(page, "trip-home.png")

await context.close()
}

await browser.close()
console.log("taste screens done")
