import { describe, expect, it } from "vitest"

import {
  buildComparisonMessage,
  buildSystemPrompt,
  describeEvidence,
  remainingMatchups,
} from "../src/comparisons.ts"
import { act, buildSet, comparison, record } from "./fixtures.ts"

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

  it("drops the orders that are already rated", () => {
    const set = buildSet({ comparisons: [comparison("anchor-high", "s01", "anchor-high")] })
    expect(pairIds(set)).not.toContain("anchor-high>s01")
    expect(pairIds(set)).toContain("s01>anchor-high")
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
    const prompt = buildSystemPrompt("Which record shows more support?")
    expect(prompt).toContain("Question: Which record shows more support?")
    expect(prompt).toContain("Where tiers conflict, the higher tier governs.")
    expect(prompt).toContain("A guarantee the record keeps in place counts as support for it")
    expect(prompt).toContain("Treat it as unknown, not as opposition.")
  })
})
