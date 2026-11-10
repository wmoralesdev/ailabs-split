import { describe, expect, it } from "vitest"

import {
  assertPaymentProofMagic,
  decodePaymentProof,
  encodePaymentProof,
  paymentProofBytesFromPayload,
} from "./payment-proof"
import { recordSettlementSchema } from "./schemas"

describe("payment proof decode", () => {
  it("round-trips bytes", () => {
    const source = new Uint8Array([
      0xff,
      0xd8,
      0xff,
      0xdb,
      ...Array(30).fill(1),
    ])
    const encoded = encodePaymentProof(source)
    expect(decodePaymentProof(encoded)).toEqual(source)
  })

  it("rejects tiny payloads", () => {
    expect(() => decodePaymentProof("abcd")).toThrow(/too small/)
  })
})

describe("payment proof magic", () => {
  it("accepts a JPEG SOI", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    expect(() => assertPaymentProofMagic(bytes, "image/jpeg")).not.toThrow()
  })

  it("rejects a PNG labeled as JPEG", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    expect(() => assertPaymentProofMagic(bytes, "image/jpeg")).toThrow(/JPEG/)
  })
})

describe("recordSettlementSchema proof", () => {
  const base = {
    code: "ABCDEF",
    fromMemberId: "from",
    toMemberId: "to",
    amountCents: 1600,
  }

  it("allows settling with no photo", () => {
    const parsed = recordSettlementSchema.parse(base)
    expect(parsed.proof).toBeUndefined()
  })

  it("accepts an optional JPEG payload", () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
      Buffer.alloc(40, 1),
    ])
    const parsed = recordSettlementSchema.parse({
      ...base,
      proof: {
        base64: jpeg.toString("base64"),
        mimeType: "image/jpeg",
      },
    })
    const stored = paymentProofBytesFromPayload(parsed.proof!)
    expect(stored.mimeType).toBe("image/jpeg")
    expect(stored.bytes[0]).toBe(0xff)
  })
})
