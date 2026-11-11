/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest"

import {
  clipboardHasText,
  imageFromTransfer,
  isImageFile,
  isTypingTarget,
  transferHasFiles,
} from "./image-from-transfer"

function jpeg(name = "ticket.jpg") {
  return new File(["ticket"], name, { type: "image/jpeg" })
}

describe("isImageFile", () => {
  it("accepts image mime types", () => {
    expect(isImageFile(jpeg())).toBe(true)
    expect(isImageFile(new File(["x"], "shot", { type: "image/png" }))).toBe(
      true
    )
  })

  it("accepts heic by name when mime is empty", () => {
    expect(isImageFile(new File(["x"], "IMG.HEIC", { type: "" }))).toBe(true)
  })

  it("rejects non-images", () => {
    expect(
      isImageFile(new File(["x"], "notes.pdf", { type: "application/pdf" }))
    ).toBe(false)
  })
})

describe("imageFromTransfer", () => {
  it("returns the first image file", () => {
    const file = jpeg()
    const transfer = {
      files: [file],
      items: [],
      types: ["Files"],
    } as unknown as DataTransfer
    expect(imageFromTransfer(transfer)).toBe(file)
  })

  it("reads a clipboard item when files is empty", () => {
    const file = new File(["x"], "image.png", { type: "image/png" })
    const transfer = {
      files: [],
      items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
      types: ["Files"],
    } as unknown as DataTransfer
    expect(imageFromTransfer(transfer)).toBe(file)
  })

  it("skips non-image files", () => {
    const transfer = {
      files: [new File(["x"], "notes.pdf", { type: "application/pdf" })],
      items: [],
      types: ["Files"],
    } as unknown as DataTransfer
    expect(imageFromTransfer(transfer)).toBeNull()
  })

  it("returns null without a transfer", () => {
    expect(imageFromTransfer(null)).toBeNull()
  })
})

describe("transferHasFiles", () => {
  it("detects the Files type", () => {
    expect(
      transferHasFiles({ types: ["Files"] } as unknown as DataTransfer)
    ).toBe(true)
    expect(
      transferHasFiles({ types: ["text/plain"] } as unknown as DataTransfer)
    ).toBe(false)
    expect(transferHasFiles(null)).toBe(false)
  })
})

describe("clipboardHasText", () => {
  it("is true for non-empty plain text", () => {
    const transfer = {
      getData: (type: string) => (type === "text/plain" ? " Ana " : ""),
    } as unknown as DataTransfer
    expect(clipboardHasText(transfer)).toBe(true)
  })

  it("is false for blank text", () => {
    const transfer = {
      getData: () => "  ",
    } as unknown as DataTransfer
    expect(clipboardHasText(transfer)).toBe(false)
  })
})

describe("isTypingTarget", () => {
  it("treats text inputs and textareas as typing", () => {
    const input = document.createElement("input")
    input.type = "text"
    expect(isTypingTarget(input)).toBe(true)
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true)
  })

  it("does not treat file or button inputs as typing", () => {
    const file = document.createElement("input")
    file.type = "file"
    const button = document.createElement("input")
    button.type = "button"
    expect(isTypingTarget(file)).toBe(false)
    expect(isTypingTarget(button)).toBe(false)
    expect(isTypingTarget(document.createElement("button"))).toBe(false)
  })
})
