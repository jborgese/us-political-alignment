import { describe, expect, it } from "vitest"

import { choosePanel } from "../src/placement.ts"

const ids = Array.from({ length: 26 }, (_, index) => `r${String(index).padStart(2, "0")}`)
const scores = Object.fromEntries(ids.map((id, index) => [id, 26 - index]))

describe("choosePanel", () => {
  it("takes ten records evenly spaced by rank, from the highest to the lowest", () => {
    expect(choosePanel(scores, ids)).toEqual(["r00", "r03", "r06", "r08", "r11", "r14", "r17", "r19", "r22", "r25"])
  })

  it("chooses only among the eligible records", () => {
    const heldBack = ["r00", "r03", "r11"]

    const panel = choosePanel(
      scores,
      ids.filter((id) => !heldBack.includes(id)),
    )

    expect(panel).toHaveLength(10)
    expect(panel.filter((id) => heldBack.includes(id))).toEqual([])
    expect(panel[0]).toBe("r01")
  })

  it("takes every eligible record, highest first, when there are ten or fewer", () => {
    expect(choosePanel(scores, ["r20", "r02", "r11"])).toEqual(["r02", "r11", "r20"])
  })

  it("breaks ties by id, so the same scale always gives the same panel", () => {
    const tied = { a: 1, b: 1, c: 0 }

    expect(choosePanel(tied, ["b", "c", "a"])).toEqual(["a", "b", "c"])
  })
})
