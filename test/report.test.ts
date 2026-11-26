import { describe, expect, it } from "vitest"

import type { Comparison, Packet } from "../src/files.ts"
import { buildReport, buildSpotCheck } from "../src/report.ts"
import { act, buildSet, comparison, comparisonsOf, completeComparisons, record, reworded } from "./fixtures.ts"

describe("buildReport", () => {
  it("names each subject and scores it against the anchors", () => {
    const report = buildReport(buildSet({ comparisons: completeComparisons(["anchor-high", "s01", "anchor-low"]) }))

    expect(report).toContain("Anchors came out in their intended order: yes")
    expect(report).toContain("| anchor-high | anchor |  | 100 |")
    expect(report).toContain("| Jane Sample | member | Sample Caucus | 50 |")
    expect(report).toContain("| anchor-low | anchor |  | 0 |")
  })

  it("withholds every score when the anchors come out of order", () => {
    const report = buildReport(buildSet({ comparisons: completeComparisons(["anchor-low", "s01", "anchor-high"]) }))

    expect(report).toContain("Anchors came out in their intended order: no")
    expect(report).toContain("Scores are withheld.")
    expect(report).not.toContain("| Jane Sample |")
  })

  it("lists each record held back from the site with the reasons", () => {
    const report = buildReport(buildSet({ comparisons: completeComparisons(["anchor-high", "s01", "anchor-low"]) }))

    expect(report).toContain("- Jane Sample: 1 official act, fewer than 3")
  })

  it("lists each reworded score beside the record's own", () => {
    const set = buildSet({ comparisons: completeComparisons(["anchor-high", "s01", "anchor-low"]) })
    const rewording = reworded(set.packets[0], "a", ["Cast a vote for holding public coverage level."])

    const report = buildReport({
      ...set,
      rewordings: [rewording],
      stability: comparisonsOf("s01.a", ["anchor-high", "s01.a", "anchor-low"]),
    })

    expect(report).toContain("- Reworded versions scored: 1 of 1")
    expect(report).toContain("| Record | Score | Version a |")
    expect(report).toContain("| Jane Sample | 50 | 50 |")
  })

  it("leaves the reworded score blank until its comparisons are rated", () => {
    const set = buildSet({ comparisons: completeComparisons(["anchor-high", "s01", "anchor-low"]) })
    const rewording = reworded(set.packets[0], "a", ["Cast a vote for holding public coverage level."])

    const report = buildReport({ ...set, rewordings: [rewording] })

    expect(report).toContain("- Reworded versions scored: 0 of 1")
    expect(report).toContain("| Jane Sample | 50 |  |")
  })

  it("says nothing about rewordings when the category has none", () => {
    const report = buildReport(buildSet({ comparisons: completeComparisons(["anchor-high", "s01", "anchor-low"]) }))

    expect(report).not.toContain("Scores when reworded")
  })

  it("refuses to report on an unfinished run", () => {
    const set = buildSet({ comparisons: [comparison("anchor-high", "anchor-low", "anchor-high")] })

    expect(() => buildReport(set)).toThrow("Rating is not finished: 5 comparisons remain")
  })

  it("refuses to report when saved comparisons mention a record that is gone", () => {
    const set = buildSet({
      comparisons: [
        ...completeComparisons(["anchor-high", "s01", "anchor-low"]),
        comparison("anchor-high", "s02", "anchor-high"),
      ],
    })

    expect(() => buildReport(set)).toThrow("no longer rated: s02")
  })
})

describe("buildReport with placed records", () => {
  const placedSubject = {
    id: "s02",
    name: "Sam Second",
    kind: "member" as const,
    group: "Sample Caucus",
    legislature: "sample-house",
    aliases: [],
  }
  const placedSet = (placements: Packet[], placed: Comparison[]) => {
    const set = buildSet({
      comparisons: completeComparisons(["anchor-high", "s01", "anchor-low"]),
      panel: ["anchor-high", "s01", "anchor-low"],
      placements,
      placed,
    })
    return { ...set, key: { ...set.key, subjects: [...set.key.subjects, placedSubject] } }
  }
  const placedLike = (id: string, twin: string): Comparison[] => [
    ...comparisonsOf(id, ["anchor-high", id, "anchor-low"]),
    comparison(id, twin, id),
    comparison(twin, id, twin),
  ]
  const flat = [act("Voted to hold coverage flat.")]

  it("scores a placed record against the fixed scale and gives any reason to hold it back", () => {
    const report = buildReport(placedSet([record("s02", flat)], placedLike("s02", "s01")))

    expect(report).toContain("- Panel: anchor-high, Jane Sample, anchor-low")
    expect(report).toContain(
      "| Sam Second | 50 | 1 official act, fewer than 3; 33% of its pairs changed winner with the order shown |",
    )
    expect(report).toContain("| Jane Sample | member | Sample Caucus | 50 |")
  })

  it("lists a placed record still being rated with how many of its comparisons are done", () => {
    const report = buildReport(placedSet([record("s02", flat)], placedLike("s02", "s01").slice(0, 2)))

    expect(report).toContain("- Still to rate: Sam Second (2 of 6)")
    expect(report).not.toContain("| Sam Second |")
  })

  it("shows a calibration copy beside its subject's own score and says the line holds", () => {
    const report = buildReport(placedSet([record("s01.votes", flat)], placedLike("s01.votes", "s01")))

    expect(report).toContain("- Mean gap: 0.0 points. Largest: 0 points.")
    expect(report).toContain("(mean gap of 5 points or less, none more than 10) holds: yes")
    expect(report).toContain("| Jane Sample | votes | 50 | 50 | 0 |")
  })

  it("says the calibration line fails when a copy lands more than 10 points from its subject", () => {
    const winsEverything = comparisonsOf("s01.votes", ["s01.votes", "anchor-high", "s01", "anchor-low"])

    const report = buildReport(placedSet([record("s01.votes", flat)], winsEverything))

    expect(report).toContain("holds: no")
  })

  it("says no panel has been chosen before the first place run", () => {
    const report = buildReport({ ...placedSet([record("s02", flat)], []), panel: null })

    expect(report).toContain("- No panel yet. Run place first.")
  })

  it("says nothing about placements when the category has none", () => {
    const report = buildReport(buildSet({ comparisons: completeComparisons(["anchor-high", "s01", "anchor-low"]) }))

    expect(report).not.toContain("Placed on the scale")
    expect(report).not.toContain("Calibration")
  })
})

describe("buildSpotCheck", () => {
  const spotCheck = buildSpotCheck(
    buildSet({ comparisons: completeComparisons(["anchor-high", "s01", "anchor-low"]) }),
    Math.random,
  )

  it("shows the evidence without ids or names", () => {
    expect(spotCheck).toContain("Voted to hold public coverage at current levels.")
    expect(spotCheck).not.toContain("s01")
    expect(spotCheck).not.toContain("anchor-high")
    expect(spotCheck).not.toContain("Jane Sample")
  })

  it("keeps the rater's answer folded away", () => {
    expect(spotCheck).toContain("<details><summary>Rater's answer</summary>")
  })
})
