import { describe, expect, it } from "vitest"

import {
  buildComparisonMessage,
  buildSystemPrompt,
  describeEvidence,
  fingerprintRecords,
  remainingMatchups,
  remainingStabilityMatchups,
  stabilityMatchups,
  supersededComparisons,
} from "../src/comparisons.ts"
import { act, buildSet, comparison, record, reworded } from "./fixtures.ts"

const pairIds = (set: ReturnType<typeof buildSet>): string[] =>
  remainingMatchups(set).map(({ first, second }) => `${first.id}>${second.id}`)

describe("remainingMatchups", () => {
  it("pairs every record with every other record in both orders", () => {
    expect(pairIds(buildSet())).toEqual([
      "anchor-high>anchor-low",
      "anchor-high>s01",
      "anchor-low>anchor-high",
      "anchor-low>s01",
      "s01>anchor-high",
      "s01>anchor-low",
    ])
  })

  it("rates a pair again when a record has changed since it was rated", () => {
    const rated = { ...comparison("anchor-high", "s01", "anchor-high"), firstHash: "old-text", secondHash: "old-text" }
    const set = buildSet({ comparisons: [rated] })

    expect(pairIds(set)).toContain("anchor-high>s01")
    expect(supersededComparisons(set)).toEqual([rated])
  })

  it("keeps a pair rated when its records still match", () => {
    const hashes = fingerprintRecords(buildSet())
    const rated = {
      ...comparison("anchor-high", "s01", "anchor-high"),
      firstHash: hashes["anchor-high"],
      secondHash: hashes.s01,
    }
    const set = buildSet({ comparisons: [rated] })

    expect(pairIds(set)).not.toContain("anchor-high>s01")
    expect(supersededComparisons(set)).toEqual([])
  })

  it("drops the orders that are already rated", () => {
    const set = buildSet({ comparisons: [comparison("anchor-high", "s01", "anchor-high")] })
    expect(pairIds(set)).not.toContain("anchor-high>s01")
    expect(pairIds(set)).toContain("s01>anchor-high")
  })
})

describe("stabilityMatchups", () => {
  const base = buildSet()
  const set = { ...base, rewordings: [reworded(base.packets[0], "a", ["Voted to keep public coverage level."])] }
  const ids = (matchups: ReturnType<typeof stabilityMatchups>): string[] =>
    matchups.map(({ first, second }) => `${first.id}>${second.id}`)

  it("pairs a rewording with every other record in both orders, and never with its own original", () => {
    expect(ids(stabilityMatchups(set))).toEqual([
      "s01.a>anchor-high",
      "anchor-high>s01.a",
      "s01.a>anchor-low",
      "anchor-low>s01.a",
    ])
  })

  it("plans nothing when the category has no rewordings", () => {
    expect(stabilityMatchups(base)).toEqual([])
  })

  it("leaves out the pairs already rated, and leaves the category's own pairs alone", () => {
    const rated = { ...set, stability: [comparison("s01.a", "anchor-high", "anchor-high")] }

    expect(ids(remainingStabilityMatchups(rated))).toEqual([
      "anchor-high>s01.a",
      "s01.a>anchor-low",
      "anchor-low>s01.a",
    ])
    expect(remainingMatchups(rated)).toHaveLength(6)
  })

  it("rates a pair again when the rewording has changed since it was rated", () => {
    const stale = { ...comparison("s01.a", "anchor-high", "anchor-high"), firstHash: "old-text", secondHash: "old-text" }

    expect(ids(remainingStabilityMatchups({ ...set, stability: [stale] }))).toContain("s01.a>anchor-high")
  })
})

describe("describeEvidence", () => {
  it("lists every section in order, items by tier, and marks a section with no evidence", () => {
    const slots = [
      { id: "keeps", heading: "What it keeps in place" },
      { id: "changes", heading: "Changes in the period" },
      { id: "seeks", heading: "What it seeks" },
    ]
    const packet = record(
      "s01",
      [
        { slot: "changes", tier: "statement", text: "Said a bill would follow." },
        act("Voted for the bill.", "changes"),
        { slot: "keeps", tier: "influence", text: "Endorsed the existing plan." },
      ],
      ["seeks"],
    )
    expect(describeEvidence(packet, slots)).toBe(
      [
        "What it keeps in place:",
        "- [Influence] Endorsed the existing plan.",
        "Changes in the period:",
        "- [Official act] Voted for the bill.",
        "- [Statement] Said a bill would follow.",
        "What it seeks:",
        "- No recorded act.",
      ].join("\n"),
    )
  })
})

describe("a category's weighing rule", () => {
  it("replaces the default weighing rule with the category's own when it has one", () => {
    const prompt = buildSystemPrompt({ question: "Which record shows more support?", weighing: "Judge by the record's own acts." })
    expect(prompt).toContain("Judge by the record's own acts.")
    expect(prompt).not.toContain("A guarantee the record keeps in place counts as support for it")
  })
})

describe("what the rater is sent", () => {
  it("leaves out record ids, slot ids, and event ids", () => {
    const first = record("s01", [{ ...act("Voted for the bill.", "slot-one"), event: "event-one" }])
    const second = record("s02", [act("Voted against the bill.", "slot-one")])
    const message = buildComparisonMessage({ first, second }, [{ id: "slot-one", heading: "Recorded acts" }])
    expect(message).toContain("Voted for the bill.")
    expect(message).not.toContain("s01")
    expect(message).not.toContain("s02")
    expect(message).not.toContain("slot-one")
    expect(message).not.toContain("event-one")
  })

  it("states the question, the tier rule, that keeping a guarantee counts, and how to read an empty section", () => {
    const prompt = buildSystemPrompt({ question: "Which record shows more support?" })
    expect(prompt).toContain("Question: Which record shows more support?")
    expect(prompt).toContain("Where tiers conflict, the higher tier governs.")
    expect(prompt).toContain("A guarantee the record keeps in place counts as support for it")
    expect(prompt).toContain("Treat it as unknown, not as opposition.")
  })
})
