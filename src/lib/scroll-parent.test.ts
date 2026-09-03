/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest"

import {
  findScrollParent,
  readScrollTop,
  subscribeScroll,
} from "./scroll-parent"

describe("scroll-parent", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("prefers the marked app-shell scroller", () => {
    document.body.innerHTML = `
      <div data-app-shell>
        <header id="host"></header>
        <div data-app-scroll id="pane"></div>
      </div>
    `
    const host = document.getElementById("host")
    const pane = document.getElementById("pane")
    expect(findScrollParent(host)).toBe(pane)
  })

  it("falls back to the nearest overflow parent", () => {
    const outer = document.createElement("div")
    outer.style.overflowY = "auto"
    const inner = document.createElement("div")
    outer.append(inner)
    document.body.append(outer)

    expect(findScrollParent(inner)).toBe(outer)
  })

  it("reads scrollTop from a scroller or the window", () => {
    const pane = document.createElement("div")
    Object.defineProperty(pane, "scrollTop", { value: 48, writable: true })
    expect(readScrollTop(pane)).toBe(48)
    expect(readScrollTop(null)).toBeTypeOf("number")
  })

  it("subscribes to the scroller and cleans up", () => {
    const pane = document.createElement("div")
    let calls = 0
    const stop = subscribeScroll(pane, () => {
      calls += 1
    })
    pane.dispatchEvent(new Event("scroll"))
    expect(calls).toBe(1)
    stop()
    pane.dispatchEvent(new Event("scroll"))
    expect(calls).toBe(1)
  })
})
