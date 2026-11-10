import type { ReceiptExtract } from "@/lib/ocr-schema"

/**
 * Live `gpt-5-mini` structured extract of the Panchimalco PRE-TICKET photo
 * (`media/ocr-qty-cnt/panchimalco-ticket.jpg`), 2026-11-10. No secrets.
 */
export const PUPUSERIA_PANCHIMALCO_LIVE_EXTRACT: ReceiptExtract = {
  title: null,
  merchant: null,
  date: "15/09/26",
  isPrecuenta: true,
  guestCountPrinted: null,
  items: [
    {
      name: "Frijol/Queso pq",
      quantity: 8,
      unitPriceCents: 140,
      amountCents: 1120,
      modifiers: [],
    },
    {
      name: "Revuelta pq",
      quantity: 10,
      unitPriceCents: 140,
      amountCents: 1400,
      modifiers: [],
    },
    {
      name: "Chicharron/Frijol pq",
      quantity: 1,
      unitPriceCents: 140,
      amountCents: 140,
      modifiers: [],
    },
    {
      name: "Frijol pq",
      quantity: 1,
      unitPriceCents: 140,
      amountCents: 140,
      modifiers: [],
    },
    {
      name: "Queso/Ajo pq",
      quantity: 2,
      unitPriceCents: 175,
      amountCents: 350,
      modifiers: [],
    },
    {
      name: "Queso/Espinaca pq",
      quantity: 1,
      unitPriceCents: 175,
      amountCents: 175,
      modifiers: [],
    },
    {
      name: "Chocolate/leche",
      quantity: 1,
      unitPriceCents: 225,
      amountCents: 225,
      modifiers: [],
    },
    {
      name: "Orden de chorizo",
      quantity: 1,
      unitPriceCents: 525,
      amountCents: 525,
      modifiers: [],
    },
    {
      name: "Yuca frita",
      quantity: 2,
      unitPriceCents: 450,
      amountCents: 900,
      modifiers: [],
    },
    {
      name: "Soda vidrio",
      quantity: 6,
      unitPriceCents: 125,
      amountCents: 750,
      modifiers: [],
    },
    {
      name: "Soda lata",
      quantity: 1,
      unitPriceCents: 125,
      amountCents: 125,
      modifiers: [],
    },
    {
      name: "Del valle",
      quantity: 1,
      unitPriceCents: 125,
      amountCents: 125,
      modifiers: [],
    },
  ],
  subtotalCents: 6000,
  totalCents: 6000,
  tip: {
    amountCents: 0,
    percentHint: 0,
  },
  fees: [],
  tax: [],
  discounts: [],
  rawText:
    "PRE-TICKET\nCARR. A LA PUERTA DEL DIABLO, SECTOR LA META LOC\nAL 4, CTON. PLANES DE RENDEROS, PANCHIMALCO, SAN\nSALVADOR\nSAN MARCOS, SAN SALVADOR\n\nCLIENTE CLIENTE VARIO\nMESA #8\t\tMESAS\nEMISION 15/09/26\t\tHORA 19:58:24\n\nATENDIO: CLOPEZ\n\n************>> TOTAL DE CUENTA <<************\nCNT PRODUCTO\tP.UNI\tTOTAL\n8 Frijol/Queso pq\t1.40\t$11.20\n10 Revuelta pq\t1.40\t$14.00\n1 Chicharron/Frijol pq\t1.40\t$1.40\n1 Frijol pq\t1.40\t$1.40\n2 Queso/Ajo pq\t1.75\t$3.50\n1 Queso/Espinaca pq\t1.75\t$1.75\n1 Chocolate/leche\t2.25\t$2.25\n1 Orden de chorizo\t5.25\t$5.25\n2 Yuca frita\t4.50\t$9.00\n6 Soda vidrio\t1.25\t$7.50\n1 Soda lata\t1.25\t$1.25\n1 Del valle\t1.25\t$1.25\n\nTOTAL VENTAS\t$60.00\nDESCUENTO\t$0.00\nSUB TOTAL\t$60.00\nPROPINA 0%\n\nTOTAL A PAGAR $60.00\nTICKET NO. 13200\n\nPAGUE EN CAJA\nGRACIAS POR SU VISITA",
}
