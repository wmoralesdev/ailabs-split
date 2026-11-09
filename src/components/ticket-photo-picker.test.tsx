/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"

import { TicketPhotoPicker } from "./ticket-photo-picker"

afterEach(() => {
  cleanup()
})

test("offers camera and gallery pickers", () => {
  const onFile = vi.fn()
  render(<TicketPhotoPicker pending={false} onFile={onFile} />)

  expect(
    screen.getByRole("button", { name: "Take photo" })
  ).toBeTruthy()
  expect(
    screen.getByRole("button", { name: "From gallery" })
  ).toBeTruthy()

  const camera = screen.getByTestId("ticket-camera-input")
  const gallery = screen.getByTestId("ticket-gallery-input")
  expect(camera.getAttribute("capture")).toBe("environment")
  expect(gallery.getAttribute("capture")).toBeNull()
  expect(gallery.getAttribute("accept")).toMatch(/image\/jpeg/)
})

test("gallery input forwards a chosen file", () => {
  const onFile = vi.fn()
  render(<TicketPhotoPicker pending={false} onFile={onFile} />)

  const file = new File(["ticket"], "ticket.jpg", { type: "image/jpeg" })
  fireEvent.change(screen.getByTestId("ticket-gallery-input"), {
    target: { files: [file] },
  })
  expect(onFile).toHaveBeenCalledTimes(1)
  expect(onFile.mock.calls[0]?.[0]).toBe(file)
})
