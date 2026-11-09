import { describe, expect, test } from "vitest"

import { tidyPlaceName } from "./dinner-labels"

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
