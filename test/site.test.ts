import { describe, expect, it } from "vitest"

import type { Key } from "../src/files.ts"
import { buildSiteData, buildSitePage } from "../src/site.ts"
import { act, buildSet, completeComparisons, record } from "./fixtures.ts"

const subject = (
  id: string,
  name: string,
  kind: Key["subjects"][number]["kind"],
  group: string,
  aliases: string[] = [],
): Key["subjects"][number] => ({ id, name, kind, group, legislature: "sample-house", aliases })

const rankedSet = (ranking: string[], withheld: string[] = [], memberName = "Jane Sample") => {
  const set = buildSet({
    packets: [
      record("s01", [{ ...act("Voted to hold coverage flat."), sources: ["https://example.org/vote"] }]),
      record("s02", [act("Its members voted to hold coverage flat.")]),
      record("s03", [act("In government, kept coverage in place.")]),
    ],
    key: {
      revealingTerms: [],
      subjects: [
        subject("s01", memberName, "member", "Sample Caucus", ["Sample"]),
        subject("s02", "Sample Caucus", "caucus", "US House"),
        subject("s03", "Example Party of Canada", "party", "Canada", ["Example Party"]),
      ],
    },
    comparisons: completeComparisons(ranking),
  })
  return { ...set, category: { ...set.category, withheld } }
}

const IN_ORDER = ["anchor-high", "s03", "s01", "s02", "anchor-low"]

describe("buildSiteData", () => {
  it("lists records from the highest score down and selects the first subject", () => {
    const data = buildSiteData(rankedSet(IN_ORDER))

    expect(data.records.map((entry) => entry.name)).toEqual([
      "High",
      "Example Party of Canada",
      "Jane Sample",
      "Sample Caucus",
      "Low",
    ])
    expect(data.records[0].score).toBe(100)
    expect(data.records[4].score).toBe(0)
    expect(data.selected).toBe(1)
  })

  it("puts parties first, then caucus lanes, then the reference records", () => {
    expect(buildSiteData(rankedSet(IN_ORDER)).lanes).toEqual(["Parties abroad", "Sample Caucus", "Reference records"])
  })

  it("labels a member, a caucus, and a party each in its own way", () => {
    const labels = buildSiteData(rankedSet(IN_ORDER))
      .records.filter((entry) => entry.kind !== "anchor")
      .map(({ label, glyph, flag, lane, detail }) => ({ label, glyph, flag, lane, detail }))

    expect(labels).toEqual([
      { label: "Example Party", glyph: "EPC", flag: "ca", lane: "Parties abroad", detail: "Canada" },
      { label: "Sample", glyph: "JS", flag: null, lane: "Sample Caucus", detail: "Sample Caucus" },
      { label: "", glyph: "SC", flag: null, lane: "Sample Caucus", detail: "House caucus" },
    ])
  })

  it("carries each item's sources into its section", () => {
    const member = buildSiteData(rankedSet(IN_ORDER)).records.find((entry) => entry.name === "Jane Sample")

    expect(member?.sections).toEqual([
      {
        heading: "Recorded acts",
        items: [{ tier: "official_act", text: "Voted to hold coverage flat.", sources: ["https://example.org/vote"] }],
      },
    ])
  })

  it("leaves a withheld record off and names it", () => {
    const data = buildSiteData(rankedSet(IN_ORDER, ["s02"]))

    expect(data.records.map((entry) => entry.name)).not.toContain("Sample Caucus")
    expect(data.heldBack).toEqual(["Sample Caucus"])
  })

  it("refuses to build when the anchors come out of order", () => {
    const set = rankedSet(["anchor-low", "s03", "s01", "s02", "anchor-high"])

    expect(() => buildSiteData(set)).toThrow("no valid scale to show")
  })
})

describe("buildSitePage", () => {
  it("escapes a name in the markup and in the embedded data", () => {
    const data = buildSiteData(rankedSet(IN_ORDER, [], "Jane <script>alert(1)</script>"))

    const { body } = buildSitePage(data, { css: "", js: "" })

    expect(body).not.toContain("<script>alert(1)")
    expect(body).toContain("Jane &lt;script&gt;alert(1)&lt;/script&gt;")
    expect(body).toContain("Jane \\u003cscript>alert(1)\\u003c/script>")
  })
})
