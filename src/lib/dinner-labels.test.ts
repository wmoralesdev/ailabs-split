import { describe, expect, test } from "vitest"

import { ocrSeedsBillName, owingAmount, tidyPlaceName } from "./dinner-labels"

describe("ocrSeedsBillName", () => {
  test("scan-first always seeds the bill name from the ticket", () => {
    expect(ocrSeedsBillName("Tuesday lunch", true)).toBe(true)
    expect(ocrSeedsBillName("Pedido de Amazon", true)).toBe(true)
  })

  test("later scans seed only a blank or meal-of-day fallback", () => {
    expect(ocrSeedsBillName("Thursday dinner", false)).toBe(true)
    expect(ocrSeedsBillName("  ", false)).toBe(true)
    expect(ocrSeedsBillName("Pedido de Amazon", false)).toBe(false)
    expect(ocrSeedsBillName("Amazon", false)).toBe(false)
  })
})

describe("tidyPlaceName", () => {
  test("title-cases a place printed in capitals", () => {
    expect(tidyPlaceName("RESTAURANTE CELESTE IMPERIO")).toBe(
      "Restaurante Celeste Imperio"
    )
    expect(tidyPlaceName("LA BIBLIOTECA CAFE  PRESIDENTE PLAZA")).toBe(
      "La Biblioteca Cafe Presidente Plaza"
    )
    expect(tidyPlaceName("PUPUSERIA DE PANCHIMALCO")).toBe(
      "Pupuseria de Panchimalco"
    )
  })

  test("keeps a name that already has its own casing", () => {
    expect(tidyPlaceName("La Biblioteca Café")).toBe("La Biblioteca Café")
    expect(tidyPlaceName("BBQ & Co")).toBe("BBQ & Co")
  })
})

describe("owingAmount", () => {
  test("zero is a word, not $0.00", () => {
    expect(owingAmount(0, "USD")).toEqual({ zero: true, text: "Nothing" })
    expect(owingAmount(1600, "USD")).toEqual({ zero: false, text: "$16.00" })
  })
})
