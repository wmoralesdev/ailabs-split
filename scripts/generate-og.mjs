/**
 * Raster Open Graph images for Split.
 *
 * Dark navy canvas. “Split” is HTML text in Google Plus Jakarta Sans Bold
 * (word only, no icon). The large graphic is a print-style halftone of the
 * official Ai Labs isotype (public/brand/ailabs-iso-light.svg — the live
 * file from ailabs.sv). Dots vary in size from sampled coverage; the mark
 * is not redrawn. Apple-touch stays the official 180×180 from ailabs.sv.
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
if (!isoSvg.includes('viewBox="0 0 278 324"')) {
  throw new Error("Expected official Ai Labs isotype at " + isoPath)
}
const isoUri = `data:image/svg+xml;base64,${isoSvg.toString("base64")}`

const fontBuf = Buffer.from(await (await fetch(FONT_URL)).arrayBuffer())
if (fontBuf.length < 1000) {
  throw new Error("Could not download Plus Jakarta Sans from Google Fonts")
}
const fontUri = `data:font/ttf;base64,${fontBuf.toString("base64")}`

const DRAW_HALFTONE = (square) => {
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

  const canvas = document.getElementById("c")
  const ctx = canvas.getContext("2d")
  const w = canvas.width
  const h = canvas.height
  ctx.fillStyle = NAVY
  ctx.fillRect(0, 0, w, h)

  const img = document.getElementById("mark")
  const aspect = img.naturalWidth / img.naturalHeight
  const markH = square ? h * 0.96 : h * 1.18
  const markW = markH * aspect
  const dx = square ? w * 0.38 : w * 0.48
  const dy = square ? h * 0.02 : h * -0.1

  const scale = 2
  const off = document.createElement("canvas")
  off.width = Math.ceil(w * scale)
  off.height = Math.ceil(h * scale)
  const ox = off.getContext("2d")
  ox.filter = "blur(2.2px)"
  ox.drawImage(img, dx * scale, dy * scale, markW * scale, markH * scale)
  const pixels = ox.getImageData(0, 0, off.width, off.height).data

  function sample(x, y) {
    const sx = Math.round(x * scale)
    const sy = Math.round(y * scale)
    if (sx < 0 || sy < 0 || sx >= off.width || sy >= off.height) {
      return { a: 0, r: 0, g: 0, b: 0 }
    }
    const i = (sy * off.width + sx) * 4
    return {
      r: pixels[i],
      g: pixels[i + 1],
      b: pixels[i + 2],
      a: pixels[i + 3] / 255,
    }
  }

  const cell = 13
  const maxDot = cell * 0.37
  const step = cell / 2
  const tap = 14

  for (let row = 0; row * step <= h + cell; row++) {
    const y = row * step
    const offset = row % 2 ? step : 0
    for (let x = offset; x <= w + cell; x += cell) {
      const pix = sample(x, y)
      if (pix.a < 0.05) continue
      const nx = (x - dx) / markW
      const da = sample(x + tap, y).a - sample(x - tap, y).a
      const local = Math.max(0.16, Math.min(1, 0.38 + da * 0.95))
      const shade = Math.pow(Math.max(0.18, 1.08 - nx * 0.82), 1.2)
      const iris = pix.a > 0.2 && pix.b > pix.r + 20 && pix.b > pix.g + 20
      const light = Math.min(1, local * 0.5 + shade * 0.55)
      const tone = pix.a * (iris ? 0.46 : light)
      if (tone < 0.06) continue
      const radius = maxDot * Math.pow(tone, 0.85)
      if (radius < 0.4) continue
      let color = PURPLE
      if (tone > 0.7) color = PAPER
      else if (tone > 0.4) color = mix(PURPLE_SOFT, PAPER, (tone - 0.4) / 0.3)
      else color = mix(PURPLE, PURPLE_SOFT, tone / 0.4)
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function pageHtml(width, height, square) {
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
#mark {
  position: absolute;
  left: -9999px;
}
.name {
  position: absolute;
  left: ${pad}px;
  bottom: ${square ? 88 : 64}px;
  z-index: 2;
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
    <img id="mark" src="${isoUri}" alt="Ai Labs" width="278" height="324">
    <canvas id="c" width="${width}" height="${height}"></canvas>
    <span class="name">Split</span>
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
    const img = document.getElementById("mark")
    if (img) await img.decode()
  })
  const used = await page.evaluate(() => {
    const span = document.querySelector(".name")
    const face = span ? getComputedStyle(span).fontFamily : ""
    const imgs = [...document.querySelectorAll(".frame img:not(#mark)")]
    return { face, text: span?.textContent, extraImgs: imgs.length }
  })
  if (!/Plus Jakarta Sans/i.test(used.face)) {
    throw new Error(`Split is not Plus Jakarta Sans: ${JSON.stringify(used)}`)
  }
  if (used.extraImgs !== 0) {
    throw new Error("Split lockup must be the word only")
  }
  await page.evaluate(DRAW_HALFTONE, square)
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
console.log("halftone subject:", isoPath)
