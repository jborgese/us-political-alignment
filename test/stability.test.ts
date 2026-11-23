import { describe, expect, it } from "vitest"

import { summarizeRun } from "../src/report.ts"
import { rewordedScores, wordingRange, wordingReasons } from "../src/stability.ts"
import { act, buildSet, comparisonsOf, completeComparisons, record, reworded } from "./fixtures.ts"

const PUBLISHED = ["anchor-high", "s01", "s02", "s03", "anchor-low"]

const packets = ["s01", "s02", "s03"].map((id) => record(id, [act(`Voted on bill ${id}.`)]))

const subjects = ["s01", "s02", "s03"].map((id) => ({
  id,
  name: `Subject ${id}`,
  kind: "member" as const,
  group: "Sample Caucus",
  legislature: "sample-house",
  aliases: [],
}))

const versionsOfMiddle = ["a", "b"].map((version) => reworded(packets[1], version, [`Cast a vote on bill ${version}.`]))

const rankingWith = (id: string, position: number): string[] => {
  const others = PUBLISHED.filter((other) => other !== "s02")
  return [...others.slice(0, position), id, ...others.slice(position)]
}

const setWhere = (positions: Record<string, number>) =>
  buildSet({
    packets,
    rewordings: versionsOfMiddle,
    key: { revealingTerms: [], subjects },
    comparisons: completeComparisons(PUBLISHED),
    stability: Object.entries(positions).flatMap(([id, position]) => comparisonsOf(id, rankingWith(id, position))),
  })

const IN_PLACE = 2
const ONE_HIGHER = 1

describe("rewordedScores", () => {
  it("gives a rewording the score its record would have had with that wording in its place", () => {
    const set = setWhere({ "s02.a": IN_PLACE, "s02.b": ONE_HIGHER })
    const { scores } = summarizeRun(set)

    const [a, b] = rewordedScores(set)

    expect(a).toMatchObject({ baseId: "s02", version: "a" })
    expect(a.score).toBeCloseTo(scores.s02)
    expect(b.score).toBeCloseTo(scores.s01)
  })

  it("gives no score to a rewording until every one of its comparisons is rated", () => {
    const set = setWhere({ "s02.a": IN_PLACE, "s02.b": IN_PLACE })
    const unfinished = { ...set, stability: set.stability.slice(1) }

    expect(rewordedScores(unfinished).map(({ version }) => version)).toEqual(["b"])
  })

  it("ignores answers given before the rewording was changed", () => {
    const set = setWhere({ "s02.a": IN_PLACE, "s02.b": IN_PLACE })
    const stale = set.stability.map((saved) =>
      saved.first === "s02.a" ? { ...saved, firstHash: "old-text", secondHash: "old-text" } : saved,
    )

    expect(rewordedScores({ ...set, stability: stale }).map(({ version }) => version)).toEqual(["b"])
  })
})

describe("wordingRange", () => {
  it("runs from the lowest to the highest score across the record and its rewordings", () => {
    const set = setWhere({ "s02.a": IN_PLACE, "s02.b": ONE_HIGHER })
    const { scores, reworded: versions } = summarizeRun(set)

    expect(wordingRange(set, scores, versions, "s02")).toEqual({
      low: Math.round(scores.s02),
      high: Math.round(scores.s01),
    })
  })

  it("gives no range until every rewording of the record is scored", () => {
    const set = setWhere({ "s02.a": IN_PLACE })
    const { scores, reworded: versions } = summarizeRun(set)

    expect(wordingRange(set, scores, versions, "s02")).toBeUndefined()
  })

  it("gives no range to a record that has no rewordings", () => {
    const set = setWhere({ "s02.a": IN_PLACE, "s02.b": IN_PLACE })
    const { scores, reworded: versions } = summarizeRun(set)

    expect(wordingRange(set, scores, versions, "s01")).toBeUndefined()
  })
})

describe("wordingReasons", () => {
  it("gives no reason when every rewording stays within the line", () => {
    const set = setWhere({ "s02.a": IN_PLACE, "s02.b": IN_PLACE })
    const { scores, reworded: versions } = summarizeRun(set)

    expect(wordingReasons(set, scores, versions, "s02")).toEqual([])
  })

  it("names the largest move when a rewording passes the line", () => {
    const set = setWhere({ "s02.a": IN_PLACE, "s02.b": ONE_HIGHER })
    const { scores, reworded: versions } = summarizeRun(set)
    const move = Math.round(scores.s01) - Math.round(scores.s02)

    expect(move).toBeGreaterThan(10)
    expect(wordingReasons(set, scores, versions, "s02")).toEqual([
      `a reworded version scored ${move} points higher, more than 10`,
    ])
  })
})
