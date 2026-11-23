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
  party?: string,
): Key["subjects"][number] => ({ id, name, kind, group, legislature: "sample-house", aliases, party })

const sourced = { ...act("Voted to hold coverage flat."), sources: ["https://example.org/vote"] }
const moreActs = [act("Voted for the second bill."), act("Voted for the third bill.")]

const rankedSet = (ranking: string[], caucusActs = moreActs, memberName = "Jane Sample") =>
  buildSet({
    packets: [
      record("s01", [sourced, ...moreActs]),
      record("s02", [act("Its members voted to hold coverage flat."), ...caucusActs]),
      record("s03", [act("In government, kept coverage in place."), ...moreActs]),
    ],
    key: {
      revealingTerms: [],
      subjects: [
        subject("s01", memberName, "member", "Sample Caucus", ["Sample"], "Democratic"),
        subject("s02", "Sample Caucus", "caucus", "US House", [], "Democratic"),
        subject("s03", "Example Party of Canada", "party", "Canada", ["Example Party"]),
      ],
    },
    comparisons: completeComparisons(ranking),
  })

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
    expect(buildSiteData(rankedSet(IN_ORDER)).lanes).toEqual([
      { name: "Parties abroad", short: "Abroad", icon: "party" },
      { name: "Sample Caucus", short: "SC", icon: "caucus" },
      { name: "Reference records", short: "Ref", icon: "anchor" },
    ])
  })

  it("labels a member, a caucus, and a party each in its own way", () => {
    const labels = buildSiteData(rankedSet(IN_ORDER))
      .records.filter((entry) => entry.kind !== "anchor")
      .map(({ label, flag, symbol, lane, detail }) => ({ label, flag, symbol, lane, detail }))

    expect(labels).toEqual([
      { label: "Example Party", flag: "ca", symbol: null, lane: "Parties abroad", detail: "Canada" },
      { label: "Sample", flag: null, symbol: "donkey", lane: "Sample Caucus", detail: "Sample Caucus" },
      { label: "", flag: null, symbol: "donkey", lane: "Sample Caucus", detail: "House caucus" },
    ])
  })

  it("carries each item's sources into its section", () => {
    const member = buildSiteData(rankedSet(IN_ORDER)).records.find((entry) => entry.name === "Jane Sample")

    expect(member?.sections[0].items[0]).toEqual({
      tier: "official_act",
      text: "Voted to hold coverage flat.",
      sources: ["https://example.org/vote"],
    })
  })

  it("holds back a record with thin evidence and says why", () => {
    const data = buildSiteData(rankedSet(IN_ORDER, []))

    expect(data.records.map((entry) => entry.name)).not.toContain("Sample Caucus")
    expect(data.heldBack).toEqual([{ name: "Sample Caucus", reasons: ["1 official act, fewer than 3"] }])
  })

  it("refuses to build when the anchors come out of order", () => {
    const set = rankedSet(["anchor-low", "s03", "s01", "s02", "anchor-high"])

    expect(() => buildSiteData(set)).toThrow("no valid scale to show")
  })
})

describe("buildSitePage", () => {
  it("escapes a name in the markup and in the embedded data", () => {
    const data = buildSiteData(rankedSet(IN_ORDER, moreActs, "Jane <script>alert(1)</script>"))

    const { body } = buildSitePage(data, { css: "", js: "" })

    expect(body).not.toContain("<script>alert(1)")
    expect(body).toContain("Jane &lt;script&gt;alert(1)&lt;/script&gt;")
    expect(body).toContain("Jane \\u003cscript>alert(1)\\u003c/script>")
  })
})
