/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { act } from "react"
import type { ComponentProps } from "react"
import { afterEach, expect, test, vi } from "vitest"

import { PaymentProofSheet } from "./payment-proof-sheet"
import type { Transfer } from "@/lib/settle"

afterEach(() => {
  cleanup()
})

const transfer: Transfer = {
  fromId: "ana",
  fromName: "Ana",
  toId: "ben",
  toName: "Ben",
  amountCents: 1600,
}

function renderSheet(
  props?: Partial<ComponentProps<typeof PaymentProofSheet>>
) {
  return render(
    <PaymentProofSheet
      transfer={transfer}
      currency="USD"
      memberId="ana"
      open
      saving={false}
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
      {...props}
    />
  )
}

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

test("offers camera and photos pickers", () => {
  renderSheet()
  expect(screen.getByRole("button", { name: "Camera" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "From photos" })).toBeTruthy()
})

test("paste attaches a clipboard image as the proof preview", () => {
  renderSheet()
  pasteImage(new File(["shot"], "shot.png", { type: "image/png" }))
  expect(screen.getByTestId("payment-proof-preview")).toBeTruthy()
})

test("paste is ignored while the sheet is closed", () => {
  const onOpenChange = vi.fn()
  const { rerender } = renderSheet({ open: false, onOpenChange })
  pasteImage(new File(["shot"], "shot.png", { type: "image/png" }))
  rerender(
    <PaymentProofSheet
      transfer={transfer}
      currency="USD"
      memberId="ana"
      open
      saving={false}
      onOpenChange={onOpenChange}
      onConfirm={vi.fn()}
    />
  )
  expect(screen.queryByTestId("payment-proof-preview")).toBeNull()
  expect(screen.getByRole("button", { name: "Camera" })).toBeTruthy()
})

test("drop attaches an image file", () => {
  renderSheet()
  const file = new File(["shot"], "shot.png", { type: "image/png" })
  fireEvent.drop(screen.getByTestId("payment-proof-drop-zone"), {
    dataTransfer: { files: [file], types: ["Files"] },
  })
  expect(screen.getByTestId("payment-proof-preview")).toBeTruthy()
})
