import { describe, expect, it } from "vitest"

import type { Key } from "../src/files.ts"
import { buildSiteData, buildSitePage } from "../src/site.ts"
import { act, buildSet, comparisonsOf, completeComparisons, record, reworded } from "./fixtures.ts"

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

const rewordedMember = (placings: string[][]) => {
  const set = rankedSet(IN_ORDER)
  const texts = ["Cast a vote for flat coverage.", "Cast a vote for the second bill.", "Cast a vote for the third bill."]
  return {
    ...set,
    rewordings: ["a", "b"].map((version) => reworded(set.packets[0], version, texts)),
    stability: placings.flatMap((ranking, index) => comparisonsOf(`s01.${"ab"[index]}`, ranking)),
  }
}

const MEMBER_IN_PLACE = (id: string): string[] => ["anchor-high", "s03", id, "s02", "anchor-low"]
const MEMBER_ABOVE_PARTY = (id: string): string[] => ["anchor-high", id, "s03", "s02", "anchor-low"]

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

  it("gives a record the range of its scores across wordings", () => {
    const data = buildSiteData(rewordedMember([MEMBER_IN_PLACE("s01.a"), MEMBER_IN_PLACE("s01.b")]))
    const member = data.records.find((entry) => entry.name === "Jane Sample")

    expect(member?.range).toEqual({ low: member?.score, high: member?.score })
    expect(data.records.filter((entry) => entry.name !== "Jane Sample").every((entry) => entry.range === null)).toBe(true)
  })

  it("gives no range while the rewordings are still being rated", () => {
    const data = buildSiteData(rewordedMember([MEMBER_IN_PLACE("s01.a")]))

    expect(data.records.every((entry) => entry.range === null)).toBe(true)
    expect(data.heldBack).toEqual([])
  })

  it("holds back a record whose rewording moved past the line and says by how much", () => {
    const data = buildSiteData(rewordedMember([MEMBER_IN_PLACE("s01.a"), MEMBER_ABOVE_PARTY("s01.b")]))

    expect(data.records.map((entry) => entry.name)).not.toContain("Jane Sample")
    expect(data.heldBack).toEqual([
      { name: "Jane Sample", reasons: [expect.stringMatching(/^a reworded version scored \d+ points higher, more than 10$/)] },
    ])
  })

  it("gives each record its score from before the latest change to the evidence", () => {
    const set = {
      ...rankedSet(IN_ORDER),
      superseded: completeComparisons(["anchor-high", "s01", "s03", "s02", "anchor-low"]),
    }

    const scores = Object.fromEntries(
      buildSiteData(set).records.map((entry) => [entry.name, entry.score - (entry.previousScore ?? Number.NaN)]),
    )

    expect(scores["Jane Sample"]).toBeLessThan(0)
    expect(scores["Example Party of Canada"]).toBeGreaterThan(0)
    expect(scores["Sample Caucus"]).toBe(0)
  })

  it("gives no earlier score when nothing has been superseded", () => {
    expect(buildSiteData(rankedSet(IN_ORDER)).records.every((entry) => entry.previousScore === null)).toBe(true)
  })

  it("refuses to build when the anchors come out of order", () => {
    const set = rankedSet(["anchor-low", "s03", "s01", "s02", "anchor-high"])

    expect(() => buildSiteData(set)).toThrow("no valid scale to show")
  })
})

describe("buildSitePage", () => {
  const pageWith = (range: { low: number; high: number } | null): string => {
    const data = buildSiteData(rankedSet(IN_ORDER))
    const records = data.records.map((entry) => (entry.name === "Jane Sample" ? { ...entry, range } : entry))
    return buildSitePage({ ...data, records }, { css: "", js: "" }, []).body
  }

  it("draws a range bar on a marker whose score moved when reworded", () => {
    const body = pageWith({ low: 44, high: 56 })

    expect(body.match(/class="range"/g)).toHaveLength(1)
    expect(body).toContain("Jane Sample, 50, 44 to 56 when reworded")
    expect(body).toContain("<strong>6</strong> points was the largest move when reworded")
    expect(body).toContain('<td class="num">44 to 56</td>')
  })

  it("draws no bar when the reworded scores match the record's own", () => {
    const body = pageWith({ low: 50, high: 50 })

    expect(body).not.toContain('class="range"')
    expect(body).toContain('<td class="num">50</td></tr>')
  })

  it("shows nothing about rewording before any record has a range", () => {
    const body = pageWith(null)

    expect(body).not.toContain("reworded")
  })


  it("links the other published issues, marks the current one, and leaves an unpublished issue unlinked", () => {
    const issues = [
      { id: "welfare-health", label: "Welfare and health", href: "../welfare-health/", current: true },
      { id: "economics", label: "Economics", href: "../economics/", current: false },
      { id: "immigration", label: "Immigration", href: null, current: false },
    ]

    const { body } = buildSitePage(buildSiteData(rankedSet(IN_ORDER)), { css: "", js: "" }, issues)

    expect(body).toContain('<a class="issue" href="../welfare-health/" aria-current="page">')
    expect(body).toContain('<a class="issue" href="../economics/">')
    expect(body).toContain('<span class="issue unpublished" title="Not yet published">')
    expect(body).not.toContain('href="../immigration/"')
  })

  it("shows no issue list when it is given none", () => {
    const { body } = buildSitePage(buildSiteData(rankedSet(IN_ORDER)), { css: "", js: "" }, [])

    expect(body).not.toContain('class="issues"')
  })

  it("escapes a name in the markup and in the embedded data", () => {
    const data = buildSiteData(rankedSet(IN_ORDER, moreActs, "Jane <script>alert(1)</script>"))

    const { body } = buildSitePage(data, { css: "", js: "" }, [])

    expect(body).not.toContain("<script>alert(1)")
    expect(body).toContain("Jane &lt;script&gt;alert(1)&lt;/script&gt;")
    expect(body).toContain("Jane \\u003cscript>alert(1)\\u003c/script>")
  })
})
