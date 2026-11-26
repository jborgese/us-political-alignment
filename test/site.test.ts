import { describe, expect, it } from "vitest"

import type { Key } from "../src/files.ts"
import { buildSiteData, buildSitePage, placeChambers, placeLeftRight } from "../src/site.ts"
import {
  act,
  buildSet,
  comparisonsOf,
  completeComparisons,
  record,
  reworded,
  siteData,
  siteRecord,
} from "./fixtures.ts"

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

  it("offers one highlight per group, caucuses before countries, and none for the reference records", () => {
    expect(buildSiteData(rankedSet(IN_ORDER)).groups).toEqual([
      { name: "Sample Caucus", kind: "caucus", flag: null },
      { name: "Canada", kind: "party", flag: "ca" },
    ])
  })

  it("labels a member, a caucus, and a party each in its own way", () => {
    const labels = buildSiteData(rankedSet(IN_ORDER))
      .records.filter((entry) => entry.kind !== "anchor")
      .map(({ label, flag, symbol, group, detail }) => ({ label, flag, symbol, group, detail }))

    expect(labels).toEqual([
      { label: "Example Party", flag: "ca", symbol: null, group: "Canada", detail: "Canada" },
      { label: "Sample", flag: null, symbol: "donkey", group: "Sample Caucus", detail: "Sample Caucus" },
      { label: "Sample Caucus", flag: null, symbol: "donkey", group: "Sample Caucus", detail: "House caucus" },
    ])
  })

  it("groups the parties at home together, with their party symbol and a key entry", () => {
    const base = rankedSet(IN_ORDER)
    const party = { ...subject("s04", "Sample Party", "party", "United States", [], "Republican"), legislature: "us-house" }
    const set = {
      ...base,
      packets: [...base.packets, record("s04", [act("In government, enacted the budget law."), ...moreActs])],
      key: { ...base.key, subjects: [...base.key.subjects, party] },
      comparisons: completeComparisons(["anchor-high", "s03", "s01", "s04", "s02", "anchor-low"]),
    }

    const data = buildSiteData(set)
    const placed = data.records.find((entry) => entry.name === "Sample Party")

    expect(placed && { flag: placed.flag, symbol: placed.symbol, group: placed.group, detail: placed.detail }).toEqual({
      flag: null,
      symbol: "elephant",
      group: "US parties",
      detail: "US party",
    })
    expect(data.groups.map(({ name }) => name)).toEqual(["Sample Caucus", "US parties", "Canada"])
    expect(buildSitePage(data, { css: "", js: "" }, []).body).toContain('<span class="glyph us-party"></span>US party')
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

  it("draws every record on one scale, tagged with its group, with a button per group", () => {
    const { body } = buildSitePage(buildSiteData(rankedSet(IN_ORDER)), { css: "", js: "" }, [])

    expect(body.match(/<div class="column [a-z]+">/g)).toEqual(['<div class="column records">', '<div class="column reference">'])
    expect(body).toContain('<button type="button" class="group" data-group="Sample Caucus" aria-pressed="false">')
    expect(body.match(/data-group="Sample Caucus"/g)).toHaveLength(3)
  })

  it("draws each country's system on its own strip, a button that lights up that country's records", () => {
    const value = (amount: number) => ({ value: amount, year: 2024 })
    const systems = {
      title: "How firm each system is",
      scope: "Taxes and work rules",
      halves: [
        { id: "taxes", label: "Taxes" },
        { id: "rules", label: "Work rules" },
      ],
      figures: [
        { id: "tax", half: "taxes", label: "Tax", source: "https://example.org/tax", values: { AAA: value(20), BBB: value(40) } },
        { id: "wage", half: "rules", label: "Wage", source: "https://example.org/wage", values: { AAA: value(0), BBB: value(100) } },
      ],
      exclusion: [],
      countries: [{ legislature: "sample-house", code: "BBB", name: "Sampleland", flag: "us", overrides: [] }],
    }

    const { body } = buildSitePage(buildSiteData({ ...rankedSet(IN_ORDER), systems }), { css: "", js: "" }, [])

    expect(body).toContain('<section class="systems" aria-label="How firm each system is">')
    expect(body).toContain('<p class="systems-note">Taxes and work rules in place before the period,')
    expect(body).toContain('class="country" data-legislature="sample-house" aria-pressed="false"')
    expect(body).toContain('style="--level:100;--low:100;--high:100"')
    expect(body.match(/class="marker"[^>]*data-legislature="sample-house"/g)).toHaveLength(3)
  })

  it("draws no system strip for a category without one", () => {
    const { body } = buildSitePage(buildSiteData(rankedSet(IN_ORDER)), { css: "", js: "" }, [])

    expect(body).not.toContain('class="systems"')
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

describe("placeLeftRight", () => {
  const LABELS = { a: "Issue A", b: "Issue B", c: "Issue C", d: "Issue D" }
  const issuesWith = (scores: Record<string, number>, extra: Record<string, number> = {}) =>
    Object.fromEntries(
      Object.keys(LABELS).map((issue) => [
        issue,
        siteData([
          siteRecord("High", "anchor", 100),
          ...(issue in scores ? [siteRecord("Jane Sample", "member", scores[issue])] : []),
          ...(issue in extra ? [siteRecord("John Example", "member", extra[issue])] : []),
          siteRecord("Low", "anchor", 0),
        ]),
      ]),
    )
  const leftRightOn = (placed: ReturnType<typeof placeLeftRight>, issue: string, name: string) =>
    placed[issue].records.find((entry) => entry.name === name)?.leftRight

  it("places a record by its average score on the other issues, leaving the page's own issue out", () => {
    const placed = placeLeftRight(issuesWith({ a: 80, b: 60, c: 40, d: 20 }), LABELS)

    expect([leftRightOn(placed, "a", "Jane Sample"), leftRightOn(placed, "b", "Jane Sample")]).toEqual([40, 47])
    expect(placed.a.leftRightFrom).toEqual(["Issue B", "Issue C", "Issue D"])
  })

  it("averages only the issues a record is shown on, and needs at least three of them", () => {
    const placed = placeLeftRight(issuesWith({ a: 80, b: 60, c: 40 }, { a: 70, b: 30 }), LABELS)

    expect(leftRightOn(placed, "a", "Jane Sample")).toBe(50)
    expect(leftRightOn(placed, "a", "John Example")).toBeNull()
  })

  it("gives the reference records no position", () => {
    const placed = placeLeftRight(issuesWith({ a: 80, b: 60, c: 40, d: 20 }), LABELS)

    expect(placed.a.records.filter((entry) => entry.kind === "anchor").map((entry) => entry.leftRight)).toEqual([
      null,
      null,
    ])
  })
})

describe("buildSitePage with a left-right axis", () => {
  const page = (leftRights: Record<string, number | null>): string => {
    const data = buildSiteData(rankedSet(IN_ORDER))
    const records = data.records.map((entry) =>
      entry.name in leftRights ? { ...entry, leftRight: leftRights[entry.name] } : entry,
    )
    return buildSitePage({ ...data, records, leftRightFrom: ["Economics", "Immigration"] }, { css: "", js: "" }, []).body
  }

  it("places each record across the axis, sets apart one with no position, and names the issues it comes from", () => {
    const body = page({ "Jane Sample": 70, "Sample Caucus": 40, "Example Party of Canada": null })

    expect(body).toContain('<div class="plot one-scale left-right has-unplaced">')
    expect(body).toContain("--x:30")
    expect(body.match(/data-unplaced/g)).toHaveLength(1)
    expect(body).toContain("Jane Sample, 50, 70 on the left-right axis")
    expect(body).toContain("average score on economics and immigration")
    expect(body).toContain('<th class="num">Left-right</th>')
  })

  it("keeps the one-scale chart when no record has a position", () => {
    const body = page({})

    expect(body).toContain('<div class="plot one-scale">')
    expect(body).not.toContain("x-axis")
    expect(body).not.toContain("data-unplaced")
  })
})

describe("placeChambers", () => {
  const member = (id: string, name: string, party: string, extra: Partial<Key["subjects"][number]> = {}) => ({
    id,
    name,
    kind: "member" as const,
    group: "Sample Caucus",
    legislature: "us-house",
    aliases: [],
    party,
    ...extra,
  })
  const subjects = [
    member("s01", "Ann Left", "Democratic"),
    member("s02", "Bob Right", "Republican", { leadership: "Majority Leader" }),
    member("s03", "Cy Fewer", "Democratic"),
    member("s04", "Di Held", "Republican"),
    member("s05", "Ed Elect", "Republican", { provisional: true }),
    member("s06", "Fay None", "Democratic"),
    member("s07", "Gil Senator", "Democratic", { legislature: "us-senate" }),
    { ...member("s08", "Sample Caucus", "Democratic"), kind: "caucus" as const },
  ]
  const inHouse = { legislature: "us-house" }
  const data = {
    ...siteData([
      siteRecord("Ann Left", "member", 80, { ...inHouse, leftRight: 70 }),
      siteRecord("Sample Caucus", "caucus", 70, { ...inHouse, leftRight: 65 }),
      siteRecord("Cy Fewer", "member", 60, inHouse),
      siteRecord("Bob Right", "member", 20, { ...inHouse, leftRight: 20 }),
    ]),
    selected: 0,
    heldBack: [{ name: "Di Held", reasons: ["1 official act, fewer than 3"] }],
  }
  const house = { id: "us-house", label: "House", seats: 435, published: true }

  it("seats members with a left-right position from left to right and lists the rest with the reason", () => {
    const [chamber] = placeChambers(data, subjects, [house]).chambers

    expect(chamber.placed.map((seat) => [seat.name, seat.role])).toEqual([
      ["Ann Left", null],
      ["Bob Right", "Majority Leader"],
    ])
    expect(Object.fromEntries(chamber.unplaced.map((seat) => [seat.name, seat.note]))).toEqual({
      "Cy Fewer": "Shown on fewer than 3 issues, so not yet on the left-right axis",
      "Fay None": "No record on this issue yet",
      "Di Held": "Held back: 1 official act, fewer than 3",
      "Ed Elect": "Member-elect: placed once they have a voting record",
    })
  })

  it("leaves an unpublished chamber off the page", () => {
    expect(placeChambers(data, subjects, [{ ...house, published: false }]).chambers).toEqual([])
  })

  it("moves a published chamber's members off the scale into their own tab, keeping them in the table", () => {
    const placed = placeChambers(data, subjects, [house])
    const body = buildSitePage(placed, { css: "", js: "" }, []).body

    expect(placed.selected).toBe(1)
    expect(body).toContain('<button type="button" role="tab" id="tab-us-house"')
    expect(body).not.toContain('aria-label="Ann Left, 80')
    expect(body).toContain('aria-label="Sample Caucus, 70')
    expect(body).not.toContain("</span>Member</li>")
    expect(body).toContain("<td>Ann Left</td>")
  })
})
