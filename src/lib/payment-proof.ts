export const PAYMENT_PROOF_MAX_BASE64_CHARS = 1_400_000
export const PAYMENT_PROOF_MAX_BYTES = 700_000
export const PAYMENT_PROOF_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const

export type PaymentProofMime = (typeof PAYMENT_PROOF_MIME_TYPES)[number]

export type PaymentProofPayload = {
  base64: string
  mimeType: PaymentProofMime
}

export function decodePaymentProof(base64: string): Uint8Array {
  const stripped = base64.replace(/\s+/g, "")
  if (stripped.length < 32) {
    throw new Error("Photo is too small")
  }
  if (stripped.length > PAYMENT_PROOF_MAX_BASE64_CHARS) {
    throw new Error("Photo is too large (max ~1MB). Try a closer crop.")
  }
  if (!/^[A-Za-z0-9+/+=]+$/.test(stripped.slice(0, 200))) {
    throw new Error("Invalid image encoding")
  }

  const bytes = Buffer.from(stripped, "base64")
  if (bytes.length < 24) {
    throw new Error("Photo is too small")
  }
  if (bytes.length > PAYMENT_PROOF_MAX_BYTES) {
    throw new Error("Photo is too large (max ~1MB). Try a closer crop.")
  }
  return Uint8Array.from(bytes)
}

export function encodePaymentProof(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}

export function assertPaymentProofMagic(
  bytes: Uint8Array,
  mime: PaymentProofMime
): void {
  switch (mime) {
    case "image/jpeg":
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        throw new Error("That file is not a JPEG")
      }
      return
    case "image/png":
      if (
        bytes[0] !== 0x89 ||
        bytes[1] !== 0x50 ||
        bytes[2] !== 0x4e ||
        bytes[3] !== 0x47
      ) {
        throw new Error("That file is not a PNG")
      }
      return
    case "image/webp":
      if (
        bytes.length < 12 ||
        bytes[0] !== 0x52 ||
        bytes[1] !== 0x49 ||
        bytes[8] !== 0x57
      ) {
        throw new Error("That file is not a WebP")
      }
      return
    default: {
      const _never: never = mime
      return _never
    }
  }
}

export function paymentProofBytesFromPayload(proof: PaymentProofPayload): {
  bytes: Uint8Array
  mimeType: PaymentProofMime
} {
  const mimeType = proof.mimeType
  const bytes = decodePaymentProof(proof.base64)
  assertPaymentProofMagic(bytes, mimeType)
  return { bytes, mimeType }
}
