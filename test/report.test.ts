import { describe, expect, it } from "vitest"

import { buildReport, buildSpotCheck } from "../src/report.ts"
import { buildSet, comparison, comparisonsOf, completeComparisons, reworded } from "./fixtures.ts"

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
