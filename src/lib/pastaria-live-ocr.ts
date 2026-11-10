import type { ReceiptExtract } from "@/lib/ocr-schema"

/**
 * Live `gpt-5-mini` structured extract of the Pastaria Mesa M11 ticket
 * (`media/pastaria-ocr/pastaria-ticket.jpg`), 2026-11-10. No secrets.
 */
export const PASTARIA_MESA_M11_LIVE_EXTRACT: ReceiptExtract = {
  title: "Pastaria",
  merchant: "Pastaria",
  date: "10-11-2026 12:53 p. m.",
  isPrecuenta: false,
  guestCountPrinted: 6,
  items: [
    {
      name: "PASTARIA MEALXL",
      quantity: 7,
      unitPriceCents: 1590,
      amountCents: 5565,
      modifiers: [],
    },
    {
      name: "INSALATA CAESAR AYCE",
      quantity: 3,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "PAST ALFREDO AYCE",
      quantity: 4,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "BRUSC BASIL PEPPERONI AYCE",
      quantity: 3,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "CREMA DI POMODORO",
      quantity: 2,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "PAST PUTTANESCA AYCE",
      quantity: 1,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "PIZZA FORMAGGIO AYCE",
      quantity: 1,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "PANINI CAPRESE AYCE",
      quantity: 1,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "PIZZA PEPPERONI AYCE",
      quantity: 1,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "CREMA DI PORRO I PATATE AYCE",
      quantity: 2,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "PIZZA JAMON AYCE",
      quantity: 1,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "PIZZA CHICK BITS AYCE",
      quantity: 1,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "LIMONADA LUNCH",
      quantity: 6,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "TE CUPON",
      quantity: 1,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
    {
      name: "PAN ALMUERZO CENA",
      quantity: 2,
      unitPriceCents: 100,
      amountCents: 100,
      modifiers: [],
    },
    {
      name: "PAST 4 FORMAGGI AYCE",
      quantity: 1,
      unitPriceCents: 0,
      amountCents: 0,
      modifiers: [],
    },
  ],
  subtotalCents: 5665,
  totalCents: 6232,
  tip: {
    amountCents: 567,
    percentHint: 10,
  },
  fees: [],
  tax: [],
  discounts: [],
  rawText:
    "Pastaria\n9a. C. pte y 87 Av. Nte, Col Escalon, Ctro. Com.\nTorre Futura, #4 y 5, San Salvador\n\nEmp.ANGEL CORTEZ\t\tMesa M11\nClientes 6\n\nCant. Descripcion\tPrecio\tTotal\n7 PASTARIA MEALXL\t15.90\t55.65\n3 INSALATA CAESAR AYCE\t0.00\t0.00\n4 PAST ALFREDO AYCE\t0.00\t0.00\n3 BRUSC BASIL PEPPERONI A\nYCE\t0.00\t0.00\n\n2 CREMA DI POMODORO\t0.00\t0.00\n1 PAST PUTTANESCA AYCE\t0.00\t0.00\n1 PIZZA FORMAGGIO AYCE\t0.00\t0.00\n1 PANINI CAPRESE AYCE\t0.00\t0.00\n1 PIZZA PEPPERONI AYCE\t0.00\t0.00\n2 CREMA DI PORRO I PATATE\nAYCE\t0.00\t0.00\n\n1 PIZZA JAMON AYCE\t0.00\t0.00\n1 PIZZA CHICK BITS AYCE\t0.00\t0.00\n6 LIMONADA LUNCH\t0.00\t0.00\n1 TE CUPON\t0.00\t0.00\n2 PAN ALMUERZO CENA\t1.00\t1.00\n1 PAST 4 FORMAGGI AYCE\t0.00\t0.00\n\nSubtotal:\t\t$56.65\nPropina (10%):\t\t$5.67\nTotal:\t\t$62.32\nESTADO: ACTIVO\n\n¡Gracias por su visita!\nORDEN #: 037946\nFecha: 10-11-2026 12:53 p. m.",
}
