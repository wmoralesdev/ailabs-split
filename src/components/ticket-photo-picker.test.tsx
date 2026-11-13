/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { act } from "react"
import { afterEach, expect, test, vi } from "vitest"

import { TicketPhotoPicker } from "./ticket-photo-picker"

afterEach(() => {
  cleanup()
})

test("offers camera and gallery pickers", () => {
  const onFile = vi.fn()
  render(<TicketPhotoPicker pending={false} onFile={onFile} />)

  expect(screen.getByRole("button", { name: "Scan ticket" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "From gallery" })).toBeTruthy()

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

test("beforePick can keep the picker closed", () => {
  const beforePick = vi.fn(() => false)
  render(
    <TicketPhotoPicker
      pending={false}
      onFile={vi.fn()}
      beforePick={beforePick}
    />
  )
  const gallery = screen.getByTestId("ticket-gallery-input")
  const click = vi.spyOn(gallery, "click")
  fireEvent.click(screen.getByRole("button", { name: "From gallery" }))
  expect(beforePick).toHaveBeenCalledTimes(1)
  expect(click).not.toHaveBeenCalled()
})

test("shows the pending label on the scan button", () => {
  render(<TicketPhotoPicker pending onFile={vi.fn()} />)
  expect(screen.getByRole("button", { name: "Reading ticket…" })).toBeTruthy()
})

test("drop zone forwards an image file", () => {
  const onFile = vi.fn()
  render(<TicketPhotoPicker pending={false} onFile={onFile} />)

  const file = new File(["ticket"], "ticket.jpg", { type: "image/jpeg" })
  fireEvent.drop(screen.getByTestId("ticket-drop-zone"), {
    dataTransfer: { files: [file], types: ["Files"] },
  })
  expect(onFile).toHaveBeenCalledTimes(1)
  expect(onFile.mock.calls[0]?.[0]).toBe(file)
})

test("beforePick can reject a drop", () => {
  const onFile = vi.fn()
  const beforePick = vi.fn(() => false)
  render(
    <TicketPhotoPicker
      pending={false}
      onFile={onFile}
      beforePick={beforePick}
    />
  )
  const file = new File(["ticket"], "ticket.jpg", { type: "image/jpeg" })
  fireEvent.drop(screen.getByTestId("ticket-drop-zone"), {
    dataTransfer: { files: [file], types: ["Files"] },
  })
  expect(beforePick).toHaveBeenCalledTimes(1)
  expect(onFile).not.toHaveBeenCalled()
})

test("drag over marks the drop zone", () => {
  render(<TicketPhotoPicker pending={false} onFile={vi.fn()} />)
  const zone = screen.getByTestId("ticket-drop-zone")
  fireEvent.dragEnter(zone, {
    dataTransfer: { types: ["Files"], files: [] },
  })
  expect(zone.getAttribute("data-dropping")).toBe("true")
  expect(screen.getByText("Drop ticket photo")).toBeTruthy()
})

function pasteImage(file: File) {
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [file],
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      types: ["Files"],
      getData: () => "",
    },
  })
  act(() => {
    window.dispatchEvent(event)
  })
}

test("paste forwards a clipboard image", () => {
  const onFile = vi.fn()
  render(<TicketPhotoPicker pending={false} onFile={onFile} />)

  const file = new File(["ticket"], "ticket.jpg", { type: "image/jpeg" })
  pasteImage(file)
  expect(onFile).toHaveBeenCalledTimes(1)
  expect(onFile.mock.calls[0]?.[0]).toBe(file)
})

test("beforePick can reject a paste", () => {
  const onFile = vi.fn()
  const beforePick = vi.fn(() => false)
  render(
    <TicketPhotoPicker
      pending={false}
      onFile={onFile}
      beforePick={beforePick}
    />
  )
  pasteImage(new File(["ticket"], "ticket.jpg", { type: "image/jpeg" }))
  expect(beforePick).toHaveBeenCalledTimes(1)
  expect(onFile).not.toHaveBeenCalled()
})

test("paste is ignored while pending", () => {
  const onFile = vi.fn()
  render(<TicketPhotoPicker pending onFile={onFile} />)
  pasteImage(new File(["ticket"], "ticket.jpg", { type: "image/jpeg" }))
  expect(onFile).not.toHaveBeenCalled()
})

test("desktop hint mentions paste", () => {
  render(<TicketPhotoPicker pending={false} onFile={vi.fn()} />)
  expect(screen.getByText("Or drop or paste a ticket photo")).toBeTruthy()
})

test("house copy can rename scan and drop labels", () => {
  render(
    <TicketPhotoPicker
      pending={false}
      onFile={vi.fn()}
      actionLabel="Scan receipt"
      dropHint="Or drop or paste a receipt photo"
      dropOverlay="Drop receipt photo"
    />
  )
  expect(screen.getByRole("button", { name: "Scan receipt" })).toBeTruthy()
  expect(screen.getByText("Or drop or paste a receipt photo")).toBeTruthy()
})
