import { describe, expect, it } from "vitest"

import { remainingMatchups, stabilityMatchups } from "../src/comparisons.ts"
import type { Comparison, RatingSet } from "../src/files.ts"
import { summarizeRun } from "../src/report.ts"
import { remainingStabilityMatchups, rewordedScores, wordingRange, wordingReasons } from "../src/stability.ts"
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

const isPlanned =
  (set: RatingSet) =>
  (saved: Comparison): boolean =>
    stabilityMatchups(set).some(({ first, second }) => first.id === saved.first && second.id === saved.second)

const firstOrdersOnly = (set: RatingSet): RatingSet => ({ ...set, stability: set.stability.filter(isPlanned(set)) })

const matchupIds = (set: RatingSet): string[] =>
  remainingStabilityMatchups(set).map(({ first, second }) => `${first.id}>${second.id}`)

describe("remainingStabilityMatchups", () => {
  it("leaves out the pairs already rated, and leaves the category's own pairs alone", () => {
    const set = firstOrdersOnly(setWhere({ "s02.a": IN_PLACE, "s02.b": IN_PLACE }))
    const [dropped, ...kept] = set.stability

    expect(matchupIds({ ...set, stability: kept })).toEqual([`${dropped.first}>${dropped.second}`])
    expect(remainingMatchups(set)).toEqual([])
  })

  it("plans the other order only for a version that moves more than 6 points", () => {
    const set = firstOrdersOnly(setWhere({ "s02.a": IN_PLACE, "s02.b": ONE_HIGHER }))
    const reversedOfB = set.stability
      .filter((saved) => saved.first === "s02.b" || saved.second === "s02.b")
      .map((saved) => `${saved.second}>${saved.first}`)

    expect(matchupIds(set).toSorted()).toEqual(reversedOfB.toSorted())
  })

  it("plans no other order while the category's own reference records are out of order", () => {
    const set = firstOrdersOnly(setWhere({ "s02.a": IN_PLACE, "s02.b": ONE_HIGHER }))

    expect(matchupIds({ ...set, comparisons: completeComparisons(PUBLISHED.toReversed()) })).toEqual([])
  })

  it("rates a pair again when the rewording has changed since it was rated", () => {
    const set = firstOrdersOnly(setWhere({ "s02.a": IN_PLACE, "s02.b": IN_PLACE }))
    const [first, ...rest] = set.stability
    const stale = { ...first, firstHash: "old-text", secondHash: "old-text" }

    expect(matchupIds({ ...set, stability: [stale, ...rest] })).toEqual([`${first.first}>${first.second}`])
  })
})

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
    const [plannedForA] = set.stability.filter(isPlanned(set)).filter((saved) => [saved.first, saved.second].includes("s02.a"))
    const unfinished = { ...set, stability: set.stability.filter((saved) => saved !== plannedForA) }

    expect(rewordedScores(unfinished).map(({ version }) => version)).toEqual(["b"])
  })

  it("scores a version from one order when it stays within 6 points, and waits for the other order when it moves more", () => {
    const set = firstOrdersOnly(setWhere({ "s02.a": IN_PLACE, "s02.b": ONE_HIGHER }))

    expect(rewordedScores(set).map(({ version }) => version)).toEqual(["a"])
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
