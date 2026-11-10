import { chromium } from "@playwright/test"
import { mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"

const OUT =
  process.env.OUT ||
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/taste-scan-first"
const BASE = process.env.BASE_URL || "http://127.0.0.1:3000"
const TICKET =
  process.env.TICKET ||
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/docs/tickets/celeste-imperio.jpg"
const SCHEMES = (process.env.SCHEMES || "light,dark").split(",")

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

async function scrollTo(page, where) {
  await page.evaluate((to) => {
    const scroller = document.querySelector("[data-app-scroll]")
    const top = to === "top" ? 0 : 1e6
    if (scroller) scroller.scrollTop = top
    else window.scrollTo(0, top)
  }, where)
  await page.waitForTimeout(250)
}

async function toastGone(page, text) {
  await page
    .getByText(text)
    .waitFor({ state: "hidden", timeout: 10_000 })
    .catch(() => {})
}

let scheme = "light"
async function shot(page, name) {
  const file = path.join(OUT, `${name}-${scheme}.png`)
  await page.screenshot({ path: file, fullPage: false, type: "png" })
  const info = await stat(file)
  if (info.size < 8_000) {
    throw new Error(`${file} looks empty (${info.size} bytes)`)
  }
  console.log("wrote", file, info.size)
}

const browser = await chromium.launch()
await mkdir(OUT, { recursive: true })
const urls = {}

for (scheme of SCHEMES) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  })
  const page = await context.newPage()
  const mode = (name) =>
    page.getByRole("group", { name: "Mode" }).getByRole("button", { name })

  await page.goto(`${BASE}/?stay=true`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  await mode("Trip").click()
  await page.getByLabel("Trip name").waitFor()
  await page.waitForTimeout(300)
  await shot(page, "landing")

  await mode("Dinner").click()
  await page.getByRole("button", { name: "Scan ticket" }).waitFor()
  await page.getByLabel("Your name").fill("Ana")
  await page.getByLabel("Your name").blur()
  await page.waitForTimeout(300)
  await shot(page, "scan-first-create")

  await page.getByTestId("ticket-gallery-input").setInputFiles(TICKET)
  await page
    .getByRole("heading", { name: "Check the ticket" })
    .waitFor({ timeout: 40_000 })
  await page.waitForTimeout(300)
  await shot(page, "check-review")
  const dinnerUrl = page.url().replace(/\/check.*$/, "")

  await page.getByRole("button", { name: "Continue to assign" }).click()
  await page.getByRole("button", { name: "Save draft for later" }).click()
  await page.waitForURL(/\/check\/[^/?]+/)
  const checkUrl = page.url().replace(/\?.*$/, "")
  await page.getByRole("button", { name: "Back" }).click()
  await page.getByLabel("Add people").waitFor()
  for (const name of ["Ben", "Cam"]) {
    await page.getByLabel("Add people").fill(name)
    await page.getByLabel("Add people").press("Enter")
    await page
      .getByRole("listitem")
      .filter({ hasText: new RegExp(`^${name}$`) })
      .waitFor()
  }
  await toastGone(page, "Draft saved")
  await scrollTo(page, "top")
  await shot(page, "dinner-home-draft")

  await page.goto(checkUrl)
  await waitForHydration(page)
  const items = page.locator("ul.group-list > li").filter({
    has: page.getByRole("button", { name: "Everyone" }),
  })
  await items.first().waitFor()
  const count = await items.count()
  for (let i = 0; i < count; i += 1) {
    await items.nth(i).getByRole("button", { name: "Everyone" }).click()
  }
  await scrollTo(page, "top")
  await shot(page, "check-editor")

  await page
    .getByRole("button", { name: /PLATO MIXTO POLLO/i })
    .first()
    .click()
  const sheet = page.getByRole("dialog")
  await sheet.getByText("Split item").waitFor()
  await page.waitForTimeout(400)
  await shot(page, "item-split")
  await sheet.getByRole("button", { name: "Save item" }).click()
  await sheet.waitFor({ state: "hidden" })

  await page.getByRole("button", { name: "Confirm check" }).click()
  await page.getByText("Confirmed").first().waitFor()
  await toastGone(page, "Check confirmed")
  await scrollTo(page, "top")
  await shot(page, "dinner-home")

  await page
    .getByRole("navigation", { name: "Dinner navigation" })
    .getByRole("link", { name: "Settle" })
    .click()
  await page.getByRole("heading", { name: "Settle up" }).waitFor()
  await page.waitForTimeout(300)
  await shot(page, "dinner-settle")

  await page.goto(`${BASE}/?stay=true&tab=join`, {
    waitUntil: "domcontentloaded",
  })
  await waitForHydration(page)
  await page.getByRole("tab", { name: "Join" }).click()
  await page.waitForTimeout(300)
  await shot(page, "join")

  await page.getByRole("tab", { name: "Create" }).click()
  await mode("Trip").click()
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
  await toastGone(page, "Expense added")
  await page.waitForTimeout(300)
  await shot(page, "trip-home")

  await page.goto(`${tripUrl}/settle`)
  await waitForHydration(page)
  await page.getByRole("heading", { name: "Settle up" }).waitFor()
  await page.waitForTimeout(300)
  await shot(page, "trip-settle")

  urls[scheme] = { dinner: dinnerUrl, check: checkUrl, trip: tripUrl }
  await context.close()
}

await browser.close()
await writeFile(
  process.env.URLS_OUT || "/tmp/taste-urls.json",
  JSON.stringify(urls, null, 2)
)
console.log("taste screens done")
