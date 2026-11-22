import { describe, expect, it } from "vitest"

import {
  buildComparisonMessage,
  buildSystemPrompt,
  describeEvidence,
  remainingMatchups,
} from "../src/comparisons.ts"
import { act, buildSet, comparison } from "./fixtures.ts"

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
  it("groups items under their tier, highest tier first", () => {
    const packet = {
      id: "s01",
      items: [
        { tier: "statement" as const, text: "Said a bill would follow." },
        act("Voted for the bill."),
        { tier: "influence" as const, text: "Endorsed the bill." },
      ],
    }
    expect(describeEvidence(packet)).toBe(
      [
        "Official acts:",
        "- Voted for the bill.",
        "Influence:",
        "- Endorsed the bill.",
        "Statements:",
        "- Said a bill would follow.",
      ].join("\n"),
    )
  })
})

describe("what the rater is sent", () => {
  it("leaves out record ids and sources", () => {
    const first = {
      id: "s01",
      items: [{ ...act("Voted for the bill."), sources: ["https://example.org/vote"] }],
    }
    const second = { id: "s02", items: [act("Voted against the bill.")] }
    const message = buildComparisonMessage({ first, second })
    expect(message).toContain("Voted for the bill.")
    expect(message).not.toContain("s01")
    expect(message).not.toContain("s02")
    expect(message).not.toContain("example.org")
  })

  it("states the question and the tier rule", () => {
    const prompt = buildSystemPrompt("Which record shows more support?")
    expect(prompt).toContain("Question: Which record shows more support?")
    expect(prompt).toContain("Where tiers conflict, the higher tier governs.")
  })
})
