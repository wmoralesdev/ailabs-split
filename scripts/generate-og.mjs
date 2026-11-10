/**
 * Raster Open Graph / apple-touch images for Split.
 * Dark canvas + Split wordmark + print-style halftone of a torn ticket
 * (same language as the in-app wash, not the Ai Labs molecule).
 */
import { chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const fontFile = path.join(
  root,
  "node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2"
)
const fontData = fs.readFileSync(fontFile).toString("base64")

const DRAW = (kind) => {
  const NAVY = "#0B0A12"
  const PAPER = "#F5F4F8"
  const PURPLE = "#614AFC"
  const PURPLE_SOFT = "#8B7CFF"

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16)
    const pb = parseInt(b.slice(1), 16)
    const ar = (pa >> 16) & 255
    const ag = (pa >> 8) & 255
    const ab = pa & 255
    const br = (pb >> 16) & 255
    const bg = (pb >> 8) & 255
    const bb = pb & 255
    const r = Math.round(ar + (br - ar) * t)
    const g = Math.round(ag + (bg - ag) * t)
    const bch = Math.round(ab + (bb - ab) * t)
    return `rgb(${r},${g},${bch})`
  }

  function smoothstep(e0, e1, x) {
    const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1)
    return t * t * (3 - 2 * t)
  }

  function roundedBox(px, py, hx, hy, r) {
    const dx = Math.abs(px) - hx + r
    const dy = Math.abs(py) - hy + r
    const ax = Math.max(dx, 0)
    const ay = Math.max(dy, 0)
    return Math.min(Math.max(dx, dy), 0) + Math.hypot(ax, ay) - r
  }

  function rotate(x, y, ang) {
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    return [x * c - y * s, x * s + y * c]
  }

  function ticketTone(nx, ny) {
    const [lx, ly] = rotate(nx, ny, -0.12)
    const left = roundedBox(lx + 0.26, ly + 0.06, 0.15, 0.74, 0.035)
    const right = roundedBox(lx - 0.26, ly - 0.12, 0.15, 0.74, 0.035)
    const sdf = Math.min(left, right)
    if (sdf > 0.05) return 0
    const which = left < right ? "left" : "right"
    const nxLight = which === "left" ? nx * 0.2 : nx * 0.55
    const light =
      0.18 + 0.82 * Math.max(0, 0.78 - (nxLight + (ny + 0.15) * 0.5) - sdf * 5)
    const edge = 1 - smoothstep(-0.008, 0.04, sdf)
    return Math.min(1, Math.max(0, edge * light))
  }

  function washTone(nx, ny) {
    const dist = Math.hypot((1 - nx) * 0.7, ny * 0.85)
    return Math.max(0, 1 - smoothstep(0.02, 1.05, dist)) * 0.35
  }

  const canvas = document.getElementById("c")
  const ctx = canvas.getContext("2d")
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = NAVY
  ctx.fillRect(0, 0, w, h)

  const cell = kind === "icon" ? 7 : 11
  const maxDot = cell * (kind === "icon" ? 0.4 : 0.46)
  const step = cell / 2

  for (let row = 0; row * step <= h + cell; row++) {
    const y = row * step
    const offset = row % 2 ? step : 0
    for (let x = offset; x <= w + cell; x += cell) {
      const nx =
        kind === "icon"
          ? (x - w * 0.5) / (w * 0.42)
          : (x - w * 0.5) / (w * 0.52)
      const ny =
        kind === "icon"
          ? (y - h * 0.5) / (h * 0.42)
          : (y - h * 0.5) / (h * 0.52)
      const gx = x / w
      const gy = y / h
      let tone = 0
      if (kind === "icon") {
        tone = ticketTone(nx, ny)
      } else {
        const fade = smoothstep(0.38, 0.56, gx)
        tone = Math.max(washTone(gx, gy) * fade, ticketTone(nx, ny))
      }
      if (tone < 0.06) continue
      const radius = maxDot * Math.pow(tone, 0.85)
      if (radius < 0.35) continue
      let color = PURPLE
      if (tone > 0.82) color = PAPER
      else if (tone > 0.48)
        color = mix(PURPLE_SOFT, PAPER, (tone - 0.48) / 0.34)
      else color = mix(PURPLE, PURPLE_SOFT, tone / 0.48)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (kind !== "icon") {
    ctx.fillStyle = PAPER
    ctx.font = "700 76px 'Plus Jakarta Sans', system-ui, sans-serif"
    ctx.textBaseline = "alphabetic"
    const y = kind === "square" ? h - 96 : h - 78
    ctx.fillText("Split", 72, y)
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
await page.addStyleTag({
  content: `@font-face{font-family:'Plus Jakarta Sans';src:url(data:font/woff2;base64,${fontData}) format('woff2');font-weight:200 800;font-style:normal;font-display:block;} html,body{margin:0;background:#0B0A12} canvas{display:block}`,
})

async function shoot(kind, outPath, width, height) {
  await page.setViewportSize({ width, height })
  await page.setContent(
    `<canvas id="c" width="${width}" height="${height}"></canvas>`,
    { waitUntil: "load" }
  )
  await page.addStyleTag({
    content: `@font-face{font-family:'Plus Jakarta Sans';src:url(data:font/woff2;base64,${fontData}) format('woff2');font-weight:200 800;font-style:normal;font-display:block;} html,body{margin:0;background:#0B0A12} canvas{display:block}`,
  })
  await page.evaluate(() => document.fonts.ready).catch(() => undefined)
  await page.evaluate(DRAW, kind)
  await page.screenshot({ path: outPath, type: "png", omitBackground: false })
}

const publicDir = path.join(root, "public")
const mediaDir = "/cursor/stores/self/media/shadcn-improve-scan"
fs.mkdirSync(publicDir, { recursive: true })
fs.mkdirSync(mediaDir, { recursive: true })
fs.mkdirSync(path.join(publicDir, "icons"), { recursive: true })

const og = path.join(publicDir, "og-image.png")
const square = path.join(publicDir, "og-image-square.png")
const apple = path.join(publicDir, "apple-touch-icon.png")
const appleIcons = path.join(publicDir, "icons", "apple-touch-icon.png")

await shoot("og", og, 1200, 630)
await shoot("square", square, 1200, 1200)
await shoot("icon", apple, 180, 180)
fs.copyFileSync(apple, appleIcons)
fs.copyFileSync(og, path.join(mediaDir, "og-image.png"))
fs.copyFileSync(square, path.join(mediaDir, "og-image-square.png"))
fs.copyFileSync(apple, path.join(mediaDir, "apple-touch-icon.png"))

await browser.close()
console.log("wrote", og)
console.log("wrote", square)
console.log("wrote", apple)
