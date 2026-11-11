import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  hideRoomLocal,
  isRoomHidden,
  listHiddenRoomCodes,
  mergeHiddenRoomCodes,
} from "./hidden-rooms"

const STORAGE_KEY = "split:hidden-rooms"

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

describe("hidden-rooms", () => {
  beforeEach(() => {
    installMemoryLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("hides a code case-insensitively", () => {
    hideRoomLocal("abc123")
    expect(isRoomHidden("ABC123")).toBe(true)
    expect(isRoomHidden("abc123")).toBe(true)
    expect(listHiddenRoomCodes()).toEqual(["ABC123"])
  })

  it("merges server codes in front without duplicates", () => {
    hideRoomLocal("aaa111")
    mergeHiddenRoomCodes(["bbb222", "aaa111"])
    expect(listHiddenRoomCodes()).toEqual(["BBB222", "AAA111"])
  })

  it("ignores corrupt storage", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not-json")
    expect(listHiddenRoomCodes()).toEqual([])
    expect(isRoomHidden("ABC123")).toBe(false)
  })
})
