/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"

import { LineQtyName } from "./line-qty-name"

afterEach(() => {
  cleanup()
})

test("qty 1 is only the product name", () => {
  render(<LineQtyName name="Chicharron/Frijol pq" quantity={1} />)

  expect(screen.getByText("Chicharron/Frijol pq")).toBeTruthy()
  expect(screen.queryByLabelText(/^Qty /)).toBeNull()
  expect(screen.queryByText("1")).toBeNull()
})

test("qty 8 is a separate count, not glued onto the name", () => {
  render(<LineQtyName name="Frijol/Queso pq" quantity={8} />)

  expect(screen.getByText("Frijol/Queso pq")).toBeTruthy()
  expect(screen.getByLabelText("Qty 8").textContent).toBe("8")
  expect(screen.queryByText(/8 × Frijol/)).toBeNull()
  expect(screen.queryByText("8 × Frijol/Queso pq")).toBeNull()
})
