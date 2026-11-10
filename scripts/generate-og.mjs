/**
 * Raster Open Graph / apple-touch images for Split.
 *
 * Dark navy + Split’s print-style halftone ticket bars. Official Ai Labs
 * isotype from public/brand (not redrawn). “Split” is HTML text in Google’s
 * Plus Jakarta Sans Bold. Apple-touch is the official mark from ailabs.sv.
 */
import { chromium } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const isoPath = path.join(root, "public/brand/ailabs-iso-light.svg")
const FONT_URL =
  "https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_TknNSg.ttf"

const isoSvg = fs.readFileSync(isoPath)
const isoUri = `data:image/svg+xml;base64,${isoSvg.toString("base64")}`

const fontBuf = Buffer.from(await (await fetch(FONT_URL)).arrayBuffer())
if (fontBuf.length < 1000) {
  throw new Error("Could not download Plus Jakarta Sans from Google Fonts")
}
const fontUri = `data:font/ttf;base64,${fontBuf.toString("base64")}`

const DRAW_HALFTONE = (shiftX) => {
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

  const cell = 11
  const maxDot = cell * 0.46
  const step = cell / 2

  for (let row = 0; row * step <= h + cell; row++) {
    const y = row * step
    const offset = row % 2 ? step : 0
    for (let x = offset; x <= w + cell; x += cell) {
      const nx = (x - w * (0.5 + shiftX)) / (w * 0.52)
      const ny = (y - h * 0.5) / (h * 0.52)
      const gx = x / w
      const gy = y / h
      const fade = smoothstep(0.38, 0.56, gx)
      const tone = Math.max(washTone(gx, gy) * fade, ticketTone(nx, ny))
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
}

function pageHtml(width, height, square) {
  const markH = square ? 88 : 72
  const typePx = square ? 92 : 76
  const pad = square ? 80 : 72
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: "Plus Jakarta Sans";
  font-style: normal;
  font-weight: 700;
  font-display: block;
  src: url("${fontUri}") format("truetype");
}
html, body {
  margin: 0;
  background: #0B0A12;
}
.frame {
  position: relative;
  width: ${width}px;
  height: ${height}px;
  overflow: hidden;
  background: #0B0A12;
}
canvas {
  position: absolute;
  inset: 0;
  display: block;
}
.lockup {
  position: absolute;
  left: ${pad}px;
  bottom: ${square ? 88 : 64}px;
  display: flex;
  align-items: center;
  gap: ${square ? 22 : 18}px;
  z-index: 2;
}
.lockup img {
  height: ${markH}px;
  width: auto;
  display: block;
}
.lockup .name {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-weight: 700;
  font-size: ${typePx}px;
  line-height: 1;
  letter-spacing: -0.03em;
  color: #f5f4f8;
  font-synthesis: none;
}
</style>
</head>
<body>
  <div class="frame">
    <canvas id="c" width="${width}" height="${height}"></canvas>
    <div class="lockup">
      <img src="${isoUri}" alt="Ai Labs" width="${Math.round((markH * 278) / 324)}" height="${markH}">
      <span class="name">Split</span>
    </div>
  </div>
</body>
</html>`
}

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })

async function shoot(outPath, width, height, square) {
  await page.setViewportSize({ width, height })
  await page.setContent(pageHtml(width, height, square), { waitUntil: "load" })
  await page.evaluate(async () => {
    await document.fonts.load("700 76px 'Plus Jakarta Sans'")
    await document.fonts.ready
    const img = document.querySelector(".lockup img")
    if (img) await img.decode()
  })
  const used = await page.evaluate(() => {
    const span = document.querySelector(".name")
    const face = span ? getComputedStyle(span).fontFamily : ""
    const loaded = [...document.fonts].map((f) => `${f.family} ${f.status}`)
    return { face, loaded, text: span?.textContent }
  })
  if (!/Plus Jakarta Sans/i.test(used.face)) {
    throw new Error(`Split is not Plus Jakarta Sans: ${JSON.stringify(used)}`)
  }
  await page.evaluate(DRAW_HALFTONE, square ? 0.06 : 0.16)
  await page.locator(".frame").screenshot({
    path: outPath,
    type: "png",
    omitBackground: false,
  })
}

const publicDir = path.join(root, "public")
const mediaDir = "/cursor/stores/self/media/og-jakarta"
fs.mkdirSync(publicDir, { recursive: true })
fs.mkdirSync(mediaDir, { recursive: true })
fs.mkdirSync(path.join(publicDir, "icons"), { recursive: true })

const og = path.join(publicDir, "og-image.png")
const square = path.join(publicDir, "og-image-square.png")
const apple = path.join(publicDir, "apple-touch-icon.png")
const appleIcons = path.join(publicDir, "icons", "apple-touch-icon.png")

await shoot(og, 1200, 630, false)
await shoot(square, 1200, 1200, true)

fs.copyFileSync(apple, appleIcons)
fs.copyFileSync(og, path.join(mediaDir, "og-image.png"))
fs.copyFileSync(square, path.join(mediaDir, "og-image-square.png"))
fs.copyFileSync(apple, path.join(mediaDir, "apple-touch-icon.png"))

await browser.close()
console.log("wrote", og)
console.log("wrote", square)
console.log("wrote", apple)
console.log("Split set in Plus Jakarta Sans (Google Fonts Bold)")
console.log("Ai Labs mark from", isoPath)
