import { describe, expect, it } from "vitest"

import {
  anchorsInOrder,
  fitBradleyTerry,
  pickSpotChecks,
  shareOfPairsAgreeingAcrossOrders,
  shareWonByFirstListed,
  toAnchoredScale,
  toOutcomes,
} from "../src/scoring.ts"
import { comparison, completeComparisons } from "./fixtures.ts"

describe("fitBradleyTerry", () => {
  it("orders records by how they fared", () => {
    const scores = fitBradleyTerry(["a", "b", "c"], toOutcomes(completeComparisons(["a", "b", "c"])))
    expect(scores.a).toBeGreaterThan(scores.b)
    expect(scores.b).toBeGreaterThan(scores.c)
  })

  it("gives finite scores to a record that never lost", () => {
    const scores = fitBradleyTerry(["a", "b"], [{ winner: "a", loser: "b" }])
    expect(Number.isFinite(scores.a)).toBe(true)
    expect(Number.isFinite(scores.b)).toBe(true)
  })

  it("gives equal scores to records that split their comparisons", () => {
    const scores = fitBradleyTerry(
      ["a", "b"],
      [
        { winner: "a", loser: "b" },
        { winner: "b", loser: "a" },
      ],
    )
    expect(scores.a).toBeCloseTo(scores.b)
  })

  it("converges on a fully consistent set the size of the pilot", () => {
    const ids = Array.from({ length: 24 }, (_, index) => `r${String(index).padStart(2, "0")}`)
    const scores = fitBradleyTerry(ids, toOutcomes(completeComparisons(ids)))
    expect(ids.toSorted((a, b) => scores[b] - scores[a])).toEqual(ids)
  })
})

describe("anchored scale", () => {
  const scores = { high: 2, middle: 0.5, low: -1, subject: 3.5 }

  it("puts the high anchor at 100 and the low anchor at 0", () => {
    const scaled = toAnchoredScale(scores, "high", "low")
    expect(scaled.high).toBeCloseTo(100)
    expect(scaled.low).toBeCloseTo(0)
    expect(scaled.middle).toBeCloseTo(50)
    expect(scaled.subject).toBeCloseTo(150)
  })

  it("accepts anchors that come out in their intended order", () => {
    expect(anchorsInOrder(scores, ["high", "middle", "low"])).toBe(true)
  })

  it("rejects anchors that come out of order", () => {
    expect(anchorsInOrder(scores, ["middle", "high", "low"])).toBe(false)
  })
})

describe("diagnostics", () => {
  const comparisons = [
    comparison("a", "b", "a"),
    comparison("b", "a", "a"),
    comparison("a", "c", "a"),
    comparison("c", "a", "c"),
  ]

  it("measures how often both presentation orders agree", () => {
    expect(shareOfPairsAgreeingAcrossOrders(comparisons)).toBe(0.5)
  })

  it("measures how often the first-listed record wins", () => {
    expect(shareWonByFirstListed(comparisons)).toBe(0.75)
  })
})

describe("pickSpotChecks", () => {
  const comparisons = completeComparisons(["a", "b", "c"])

  it("picks the requested number of distinct comparisons", () => {
    const picked = pickSpotChecks(comparisons, 4, Math.random)
    expect(picked).toHaveLength(4)
    expect(new Set(picked).size).toBe(4)
  })

  it("follows the random source it is given", () => {
    const draws = [0.9, 0.1, 0.5, 0.3, 0.7, 0.2]
    const picked = pickSpotChecks(comparisons, 2, () => draws.shift() ?? 1)
    expect(picked).toEqual([comparisons[1], comparisons[5]])
  })

  it("returns every comparison when fewer exist than requested", () => {
    expect(pickSpotChecks(comparisons, 50, Math.random)).toHaveLength(comparisons.length)
  })
})
