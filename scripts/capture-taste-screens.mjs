import { chromium } from "@playwright/test"
import { mkdir, stat } from "node:fs/promises"
import path from "node:path"

const OUT = "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/taste"
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

async function shot(page, name) {
  const file = path.join(OUT, name)
  await page.screenshot({ path: file, fullPage: false, type: "png" })
  const info = await stat(file)
  if (info.size < 8_000) {
    throw new Error(`${file} looks empty (${info.size} bytes)`)
  }
  console.log("wrote", file, info.size)
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
})
await mkdir(OUT, { recursive: true })

await page.goto(`${BASE}/?stay=true`, { waitUntil: "domcontentloaded" })
await waitForHydration(page)
const dinnerChip = page.getByRole("group", { name: "Mode" }).getByRole("button", {
  name: "Dinner",
})
await dinnerChip.click()
await page.getByRole("button", { name: "Create dinner" }).waitFor()
await page.getByLabel("Dinner name").fill("Friday pizzas")
await page.getByLabel("Your name").fill("Ana")
await shot(page, "dinner-landing.png")

const dinnerName = `Friday pizzas ${Date.now()}`
await page.getByLabel("Dinner name").fill(dinnerName)
await page.getByRole("button", { name: "Create dinner" }).click()
const ready = page.getByRole("dialog")
await ready.getByText("Dinner ready").waitFor()
await page.waitForTimeout(350)
await shot(page, "dinner-created.png")

await page.getByRole("button", { name: "Continue to dinner" }).click()
await page.getByRole("heading", { name: dinnerName }).waitFor()
await page.getByText("Dinner created").waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {})

await page.getByRole("button", { name: "Add people" }).click()
const people = page.getByRole("dialog")
await people.getByText("Add people").waitFor()
for (const name of ["Ben", "Cam"]) {
  await people.getByPlaceholder("Type a name").fill(name)
  await people.getByRole("button", { name: "Add", exact: true }).click()
}
await people.getByRole("button", { name: "Save names" }).click()
await people.waitFor({ state: "hidden" })

await page.getByRole("link", { name: "Enter bill manually" }).click()
await waitForHydration(page)
await page.getByRole("button", { name: "Enter bill manually" }).click()
await page.getByLabel("Place").waitFor()
await page.getByLabel("Place").fill("Pizza night")
await page.getByPlaceholder("Item").fill("Pizza Margherita")
await page.getByLabel("Quantity").fill("1")
await page.getByLabel("Item amount").fill("24.00")
await page.getByRole("button", { name: "Add item" }).click()
await page.getByRole("button", { name: /Pizza Margherita/ }).waitFor()
await page.getByText("Check confirmed").waitFor({ state: "hidden", timeout: 4_000 }).catch(() => {})
await shot(page, "dinner-check.png")

await page.getByRole("button", { name: /Pizza Margherita/ }).click()
const split = page.getByRole("dialog")
await split.getByText("Split item").waitFor()
await page.waitForTimeout(400)
await shot(page, "dinner-item-split.png")

for (const person of ["Ana", "Ben", "Cam"]) {
  await split
    .getByRole("listitem")
    .filter({ hasText: person })
    .getByRole("button")
    .filter({ hasText: person })
    .click()
}
await split.getByRole("button", { name: "Save item" }).click()
await split.waitFor({ state: "hidden" })
const confirm = page.getByRole("button", { name: "Confirm check" })
await confirm.scrollIntoViewIfNeeded()
await confirm.click()
await page.getByText("Confirmed").first().waitFor()
await page.getByRole("heading", { name: dinnerName }).waitFor()
await page.getByText("Check confirmed").waitFor({ state: "hidden", timeout: 8_000 }).catch(() => {})
await page.evaluate(() => {
  const scroller = document.querySelector("[data-app-scroll]")
  if (scroller) scroller.scrollTop = 0
  else window.scrollTo(0, 0)
})
await page.waitForTimeout(200)
await shot(page, "dinner-home-confirmed.png")

await page
  .getByRole("navigation", { name: "Dinner navigation" })
  .getByRole("link", { name: "Settle" })
  .click()
await page.getByRole("heading", { name: "Settle up" }).waitFor()
await page.waitForTimeout(200)
await shot(page, "dinner-settle.png")

const ref = path.join(OUT, "ailabs-sv-reference.png")
const refInfo = await stat(ref)
if (refInfo.size < 8_000) throw new Error("ailabs-sv-reference.png missing or empty")
console.log("reference", ref, refInfo.size)

await browser.close()
console.log("taste screens done")
