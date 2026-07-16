import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { rememberRecentTrip } from "./recent-trips"
import { getMostRecentTripCode } from "./resume-trip"

function installMemoryLocalStorage() {
  const store = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
  }
  vi.stubGlobal("window", { localStorage })
  vi.stubGlobal("localStorage", localStorage)
}

describe("resume-trip", () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns the most recent trip code", () => {
    rememberRecentTrip({ code: "aaaaaa", name: "Alpha" })
    rememberRecentTrip({ code: "bbbbbb", name: "Beta" })
    expect(getMostRecentTripCode()).toBe("BBBBBB")
  })

  it("returns null when no recent trips exist", () => {
    expect(getMostRecentTripCode()).toBeNull()
  })
})
