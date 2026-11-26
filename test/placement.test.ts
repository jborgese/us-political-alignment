import { describe, expect, it } from "vitest"

import type { Evidence } from "../src/files.ts"
import { choosePanel, placedScores, placementMatchups } from "../src/placement.ts"
import { act, buildSet, comparison, record } from "./fixtures.ts"

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

describe("placementMatchups", () => {
  const stated = (text: string): Evidence => ({ slot: "acts", tier: "statement", text })
  const pressed = (text: string): Evidence => ({ slot: "acts", tier: "influence", text })
  const panel = ["anchor-high", "s01", "anchor-low"]
  const set = buildSet({
    packets: [
      record("s01", [
        stated("Said a bill would follow."),
        { ...act("Voted for the shared budget."), event: "budget" },
        act("Voted for the first bill."),
        pressed("Urged a vote."),
        act("Voted for the second bill."),
      ]),
    ],
    placements: [
      record("s02", [act("Voted to hold coverage flat."), stated("Pledged to hold it.")]),
      record("s03", [
        act("Voted to hold coverage flat."),
        act("Voted to keep the rules."),
        stated("Pledged to hold it."),
        stated("Pledged to keep them."),
      ]),
    ],
  })
  const opponentsOf = (placedId: string) =>
    placementMatchups(set, panel)
      .filter(({ first }) => first.id === placedId)
      .map(({ second }) => ({ id: second.id, items: second.items.map((item) => item.text) }))

  it("cuts a longer panel record to as many items: highest tier first, its own before stances on shared events, in file order", () => {
    expect(opponentsOf("s02")).toContainEqual({ id: "s01~2", items: ["Voted for the first bill.", "Voted for the second bill."] })
    expect(opponentsOf("s03")).toContainEqual({
      id: "s01~4",
      items: ["Voted for the shared budget.", "Voted for the first bill.", "Urged a vote.", "Voted for the second bill."],
    })
  })

  it("uses a panel record whole when it has no more items than the placed record", () => {
    expect(opponentsOf("s02")).toContainEqual({
      id: "anchor-high",
      items: ["Voted to expand public coverage to every resident."],
    })
  })
})

describe("placedScores", () => {
  it("scores answers against a cut panel record with that record's full score", () => {
    const set = buildSet({
      packets: [record("s01", [act("Voted to hold coverage flat."), act("Voted to keep the rules.")])],
      placements: [record("s02", [act("Voted to keep coverage level.")])],
      placed: [
        comparison("s02", "anchor-high", "anchor-high"),
        comparison("anchor-high", "s02", "anchor-high"),
        comparison("s02", "s01~1", "s02"),
        comparison("s01~1", "s02", "s01~1"),
        comparison("s02", "anchor-low", "s02"),
        comparison("anchor-low", "s02", "s02"),
      ],
    })
    const fitted = { "anchor-high": 2, s01: 0, "anchor-low": -2 }
    const scale = { fitted, highAnchorId: "anchor-high", lowAnchorId: "anchor-low" }

    expect(placedScores(set, ["anchor-high", "s01", "anchor-low"], scale).s02).toBeCloseTo(50)
  })
})
