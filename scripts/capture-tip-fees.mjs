import { chromium } from "@playwright/test"
import { mkdir, stat } from "node:fs/promises"
import path from "node:path"

const OUT =
  process.env.OUT ||
  "/cursor/stores/bc-01a1be84-5756-78cf-8cab-8c393ca5e1f5/media/tip-fees-ui"
const BASE = process.env.BASE_URL || "http://localhost:3000"

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

/** Crop from the top of `from` to the bottom of `to`, full width, padded. */
async function closeup(page, file, from, to, pad = 16) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  if (!a || !b) throw new Error(`${file}: close-up target not visible`)
  const y = Math.max(0, a.y - pad)
  await page.screenshot({
    path: file,
    type: "png",
    clip: {
      x: 0,
      y,
      width: 390,
      height: Math.min(844, b.y + b.height + pad - y),
    },
  })
  const info = await stat(file)
  if (info.size < 4_000) {
    throw new Error(`${file} looks empty (${info.size} bytes)`)
  }
  console.log("wrote", file, info.size)
}

async function openCheck(page) {
  await page.goto(`${BASE}/?stay=true`, { waitUntil: "domcontentloaded" })
  await waitForHydration(page)
  const dinnerChip = page
    .getByRole("group", { name: "Mode" })
    .getByRole("button", { name: "Dinner" })
  await dinnerChip.click()
  await page.getByRole("button", { name: "Create dinner" }).waitFor()
  await page.getByLabel("Your name").fill("Ana")
  await page.getByLabel("Dinner name").fill(`Tip fees ${Date.now()}`)
  await page.getByRole("button", { name: "Create dinner" }).click()
  const ready = page.getByRole("dialog")
  await ready.getByText("Dinner ready").waitFor()
  await ready.getByRole("button", { name: "Add the bill" }).click()
  await waitForHydration(page)
  await page.getByLabel("Place").waitFor()
  await page.getByLabel("Place").fill("Pizza night")
  await page.getByLabel("Item", { exact: true }).fill("Pizza Margherita")
  await page.getByLabel("Price", { exact: true }).fill("24.00")
  await page.getByRole("button", { name: "Add item" }).click()
  await page.getByRole("button", { name: /Pizza Margherita/ }).waitFor()
  await page.getByRole("button", { name: "Add a fee or service charge" }).click()
  await page.getByLabel("Fee name").waitFor()
  const section = page.getByRole("region", { name: "Tip and fees" })
  await page.evaluate(() => {
    const scroller = document.querySelector("[data-app-scroll]")
    const heading = document.getElementById("extras-heading")
    if (!scroller || !heading) return
    const sRect = scroller.getBoundingClientRect()
    const hRect = heading.getBoundingClientRect()
    scroller.scrollTop += hRect.top - sRect.top - 8
  })
  return section
}

const browser = await chromium.launch()
await mkdir(OUT, { recursive: true })

for (const scheme of ["light", "dark"]) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  })
  const page = await context.newPage()
  const section = await openCheck(page)
  await page.waitForTimeout(200)
  await closeup(
    page,
    path.join(OUT, `tip-fees-row-${scheme}.png`),
    section.getByRole("heading", { name: "Tip and fees" }),
    page.getByRole("button", { name: "Add fee" })
  )

  await page.getByRole("button", { name: "Percent" }).click()
  await page.getByLabel("Fee percent").fill("10")
  await page.getByText("Adds $2.40 on the item subtotal").waitFor()
  await page.waitForTimeout(150)
  await closeup(
    page,
    path.join(OUT, `tip-fees-percent-${scheme}.png`),
    section.getByRole("heading", { name: "Tip and fees" }),
    page.getByRole("button", { name: "Add fee" })
  )
  await context.close()
}

await browser.close()
console.log("tip-fees close-ups done")
