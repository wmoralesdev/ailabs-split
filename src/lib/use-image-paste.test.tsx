/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { act, useState } from "react"
import { afterEach, expect, test, vi } from "vitest"

import { useImagePaste } from "./use-image-paste"

afterEach(() => {
  cleanup()
})

function pasteEvent(data: {
  files?: File[]
  text?: string
  target?: EventTarget
}) {
  const file = data.files?.[0]
  const files = data.files ?? []
  const clipboardData = {
    files,
    items: file
      ? [{ kind: "file", type: file.type, getAsFile: () => file }]
      : [],
    types: file ? ["Files"] : data.text ? ["text/plain"] : [],
    getData: (type: string) => (type === "text/plain" ? (data.text ?? "") : ""),
  }
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", { value: clipboardData })
  if (data.target)
    Object.defineProperty(event, "target", { value: data.target })
  return event
}

function Harness({
  enabled = true,
  onImage,
}: {
  enabled?: boolean
  onImage?: (file: File) => void
}) {
  const [name, setName] = useState("")
  const [file, setFile] = useState<File | null>(null)
  useImagePaste({
    enabled,
    onImage: (next) => {
      onImage?.(next)
      setFile(next)
    },
  })
  return (
    <div>
      <input
        aria-label="Your name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {file ? <span>got {file.name}</span> : <span>empty</span>}
    </div>
  )
}

test("paste of a clipboard image calls onImage", () => {
  const onImage = vi.fn()
  render(<Harness onImage={onImage} />)
  const file = new File(["ticket"], "ticket.jpg", { type: "image/jpeg" })
  act(() => {
    window.dispatchEvent(pasteEvent({ files: [file] }))
  })
  expect(onImage).toHaveBeenCalledTimes(1)
  expect(onImage.mock.calls[0]?.[0]).toBe(file)
  expect(screen.getByText("got ticket.jpg")).toBeTruthy()
})

test("does nothing when disabled", () => {
  const onImage = vi.fn()
  render(<Harness enabled={false} onImage={onImage} />)
  act(() => {
    window.dispatchEvent(
      pasteEvent({
        files: [new File(["ticket"], "ticket.jpg", { type: "image/jpeg" })],
      })
    )
  })
  expect(onImage).not.toHaveBeenCalled()
})

test("leaves text paste in a field alone", () => {
  const onImage = vi.fn()
  render(<Harness onImage={onImage} />)
  const input = screen.getByLabelText("Your name")
  act(() => {
    input.dispatchEvent(pasteEvent({ text: "Ana" }))
  })
  expect(onImage).not.toHaveBeenCalled()
})

test("still attaches an image while a text field is focused", () => {
  const onImage = vi.fn()
  render(<Harness onImage={onImage} />)
  const input = screen.getByLabelText("Your name")
  const file = new File(["shot"], "shot.png", { type: "image/png" })
  act(() => {
    input.dispatchEvent(pasteEvent({ files: [file] }))
  })
  expect(onImage).toHaveBeenCalledTimes(1)
  expect(onImage.mock.calls[0]?.[0]).toBe(file)
})
