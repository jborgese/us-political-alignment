import { describe, expect, it } from "vitest"

import {
  findSetProblems,
  packetsWithoutEvidence,
  ratedPackets,
  subjectsWithoutPackets,
} from "../src/ratingSet.ts"
import { act, buildSet } from "./fixtures.ts"

const setWithPacketText = (text: string) => buildSet({ packets: [{ id: "s01", items: [act(text)] }] })

describe("findSetProblems", () => {
  it("finds nothing wrong with a clean set", () => {
    expect(findSetProblems(buildSet())).toEqual([])
  })

  it("flags a revealing term whatever its letter case", () => {
    expect(findSetProblems(setWithPacketText("Voted to expand medicare."))).toEqual([
      's01 mentions "Medicare": Voted to expand medicare.',
    ])
  })

  it("flags the subject's own name and aliases", () => {
    const problems = findSetProblems(setWithPacketText("Jane Sample sponsored the bill."))
    expect(problems).toContain('s01 mentions "Jane Sample": Jane Sample sponsored the bill.')
    expect(problems).toContain('s01 mentions "Sample": Jane Sample sponsored the bill.')
  })

  it("matches an all-capitals term only in capitals", () => {
    expect(findSetProblems(setWithPacketText("Told us the bill would pass."))).toEqual([])
    expect(findSetProblems(setWithPacketText("Voted for the US budget."))).toHaveLength(1)
  })

  it("does not flag a term inside a longer word", () => {
    expect(findSetProblems(setWithPacketText("Voted for the Medicareplus pilot."))).toEqual([])
  })

  it("checks the anchors as well as the packets", () => {
    const set = buildSet()
    const leaky = {
      ...set,
      category: { ...set.category, anchors: [{ id: "anchor-high", items: [act("Voted to expand Medicare.")] }] },
    }
    expect(findSetProblems(leaky)).toEqual(['anchor-high mentions "Medicare": Voted to expand Medicare.'])
  })

  it("flags a packet that has no entry in the key", () => {
    const set = buildSet({ packets: [{ id: "s99", items: [act("Voted to hold coverage flat.")] }] })
    expect(findSetProblems(set)).toEqual(["s99 has no entry in key.json"])
  })

  it("flags an id used by more than one record", () => {
    const set = buildSet({ packets: [{ id: "anchor-high", items: [act("Voted to hold coverage flat.")] }] })
    expect(findSetProblems(set)).toContain("More than one record has the id anchor-high")
  })
})

describe("coverage", () => {
  const set = buildSet({
    packets: [
      { id: "s01", items: [act("Voted to hold coverage flat.")] },
      { id: "s02", items: [] },
    ],
    key: {
      revealingTerms: [],
      subjects: ["s01", "s02", "s03"].map((id) => ({
        id,
        name: `Subject ${id}`,
        kind: "member" as const,
        group: "Sample Caucus",
        aliases: [],
      })),
    },
  })

  it("leaves packets with no evidence out of the rating", () => {
    expect(ratedPackets(set).map((packet) => packet.id)).toEqual(["anchor-high", "anchor-low", "s01"])
    expect(packetsWithoutEvidence(set).map((packet) => packet.id)).toEqual(["s02"])
  })

  it("lists subjects that have no packet", () => {
    expect(subjectsWithoutPackets(set)).toEqual(["s03"])
  })
})
