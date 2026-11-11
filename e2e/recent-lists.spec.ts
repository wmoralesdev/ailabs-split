import { expect, test } from "@playwright/test"

import { openLanding, waitForHydration } from "./dinner-helpers"

const RECENT = [
  {
    code: "MQTF3K7",
    name: "Monday lunch",
    updatedAt: Date.now() - 37 * 60_000,
    kind: "DINNER",
  },
  {
    code: "UK3R47Y",
    name: "Guate pet",
    updatedAt: Date.now() - 27 * 86_400_000,
    kind: "TRIP",
  },
  {
    code: "NV5KQJV",
    name: "Costa Rica",
    updatedAt: Date.parse("2026-07-23T12:00:00Z"),
    kind: "TRIP",
  },
]

test("recent trips sit in one grouped card", async ({ page }) => {
  await page.addInitScript((trips) => {
    window.localStorage.setItem("split:recent-trips", JSON.stringify(trips))
  }, RECENT)

  await openLanding(page)
  await waitForHydration(page)

  const recent = page.getByRole("region", { name: "Recent trips" })
  await expect(recent).toBeVisible()
  await expect(recent.getByText("Continue", { exact: true })).toBeVisible()
  await expect(recent.getByText("Monday lunch")).toBeVisible()
  await expect(recent.getByText("Guate pet")).toBeVisible()
  await expect(recent.getByText("Costa Rica")).toBeVisible()

  const continueRow = recent.getByRole("button", {
    name: "Continue Monday lunch",
  })
  await expect(continueRow).toBeVisible()
  await expect(continueRow).not.toHaveClass(/rounded-2xl/)
  await recent.screenshot({ path: "test-results/recent-list.png" })

  await recent.getByRole("button", { name: "Hide Guate pet" }).click()
  await expect(recent.getByText("Guate pet")).toHaveCount(0)
  await expect(recent.getByText("Monday lunch")).toBeVisible()
  await expect(recent.getByText("Costa Rica")).toBeVisible()
})
