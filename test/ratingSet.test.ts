import { describe, expect, it } from "vitest"

import type { Packet } from "../src/files.ts"
import {
  findSetProblems,
  packetsWithoutEvidence,
  ratedPackets,
  subjectsWithoutPackets,
  thinEvidenceReasons,
} from "../src/ratingSet.ts"
import { act, buildSet, comparison, completeComparisons, record, reworded } from "./fixtures.ts"

const setWithPacketText = (text: string) => buildSet({ packets: [record("s01", [act(text)])] })

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

  it("checks a record's country context as well as its items", () => {
    const leaky = buildSet({ packets: [{ ...record("s01", [act("Voted for the bill.")]), context: "Medicare covers older residents." }] })
    expect(findSetProblems(leaky)).toEqual(['s01 mentions "Medicare": Medicare covers older residents.'])
  })

  it("checks the anchors as well as the packets", () => {
    const set = buildSet()
    const leaky = {
      ...set,
      category: { ...set.category, anchors: [record("anchor-high", [act("Voted to expand Medicare.")])] },
    }
    expect(findSetProblems(leaky)).toEqual(['anchor-high mentions "Medicare": Voted to expand Medicare.'])
  })

  it("flags a packet that has no entry in the key", () => {
    const set = buildSet({ packets: [record("s99", [act("Voted to hold coverage flat.")])] })
    expect(findSetProblems(set)).toEqual(["s99 has no entry in key.json"])
  })

  it("flags an id used by more than one record", () => {
    const set = buildSet({ packets: [record("anchor-high", [act("Voted to hold coverage flat.")])] })
    expect(findSetProblems(set)).toContain("More than one record has the id anchor-high")
  })
})

describe("slots", () => {
  const setWithPlansSlot = (packet: Packet) => {
    const set = buildSet({ packets: [packet] })
    return {
      ...set,
      category: {
        ...set.category,
        slots: [...set.category.slots, { id: "plans", heading: "Plans" }],
        anchors: set.category.anchors.map((anchor) => ({ ...anchor, emptySlots: ["plans"] })),
      },
    }
  }

  it("flags a slot that is neither filled nor listed as empty", () => {
    const set = setWithPlansSlot(record("s01", [act("Voted to hold coverage flat.")]))
    expect(findSetProblems(set)).toEqual([
      "s01 leaves the slot plans unanswered: add an item or list it in emptySlots",
    ])
  })

  it("accepts a slot that is listed as empty", () => {
    const set = setWithPlansSlot(record("s01", [act("Voted to hold coverage flat.")], ["plans"]))
    expect(findSetProblems(set)).toEqual([])
  })

  it("flags a slot that is listed as empty and also has an item", () => {
    const set = setWithPlansSlot(
      record("s01", [act("Voted to hold coverage flat."), act("Introduced a coverage bill.", "plans")], ["plans"]),
    )
    expect(findSetProblems(set)).toEqual(["s01 lists the slot plans as empty but has an item in it"])
  })

  it("flags a slot the category does not have", () => {
    const set = setWithPlansSlot(
      record("s01", [act("Voted to hold coverage flat."), act("Gave a speech.", "speeches")], ["plans"]),
    )
    expect(findSetProblems(set)).toEqual(["s01 uses the slot speeches, which the category does not have"])
  })
})

describe("events", () => {
  const budget = { id: "budget", slot: "acts", text: "a budget", sources: ["https://example.org/budget"] }
  const setWithBudgetEvent = (packet: Packet) =>
    buildSet({ legislatures: [{ id: "sample-house", events: [budget] }], packets: [packet] })

  it("flags a record that takes no stance on an event of its legislature", () => {
    const set = setWithBudgetEvent(record("s01", [act("Voted to hold coverage flat.")]))
    expect(findSetProblems(set)).toEqual(["s01 takes no stance on the event budget"])
  })

  it("accepts a record with a stance on every event of its legislature", () => {
    const set = setWithBudgetEvent(record("s01", [{ ...act("Voted against a budget."), event: "budget" }]))
    expect(findSetProblems(set)).toEqual([])
  })
})

describe("findSetProblems on rewordings", () => {
  const base = record("s01", [act("Voted to cut public coverage by 5 percent.")])
  const problemsWith = (text: string) => findSetProblems(buildSet({ packets: [base], rewordings: [reworded(base, "a", [text])] }))

  it("accepts a rewording that changes the words and keeps the numbers", () => {
    expect(problemsWith("Cast a vote for lowering public coverage by 5 percent.")).toEqual([])
  })

  it("flags a rewording that names a revealing term", () => {
    expect(problemsWith("Cast a vote for lowering Medicare by 5 percent.")).toEqual([
      's01.a mentions "Medicare": Cast a vote for lowering Medicare by 5 percent.',
    ])
  })

  it("flags a rewording that changes a number", () => {
    expect(problemsWith("Cast a vote for lowering public coverage by 15 percent.")).toEqual([
      "s01.a changes the numbers in item 1 of s01: 5 became 15",
    ])
  })

  it("flags a rewording that drops a number", () => {
    expect(problemsWith("Cast a vote for lowering public coverage.")).toEqual([
      "s01.a changes the numbers in item 1 of s01: 5 became none",
    ])
  })

  it("flags a rewording that repeats the original wording", () => {
    expect(problemsWith("Voted to cut public coverage by 5 percent.")).toEqual([
      "s01.a repeats the wording of item 1 of s01",
    ])
  })
})

describe("thinEvidenceReasons", () => {
  const threeActs = [act("Voted for the first bill."), act("Voted for the second bill."), act("Voted for the third bill.")]

  it("finds nothing thin in a record with three official acts and steady results", () => {
    const set = buildSet({
      packets: [record("s01", threeActs)],
      comparisons: completeComparisons(["anchor-high", "s01", "anchor-low"]),
    })

    expect(thinEvidenceReasons(set, set.packets[0])).toEqual([])
  })

  it("names a required section with nothing in it and a shortage of official acts", () => {
    const set = buildSet({ packets: [record("s01", [act("Voted for the bill.")], ["keeps"])] })
    const withRequiredSlot = {
      ...set,
      category: {
        ...set.category,
        slots: [...set.category.slots, { id: "keeps", heading: "What it keeps in place", required: true }],
      },
    }

    expect(thinEvidenceReasons(withRequiredSlot, set.packets[0])).toEqual([
      'nothing under "What it keeps in place"',
      "1 official act, fewer than 3",
    ])
  })

  it("names a record whose pairs change winner with the order shown", () => {
    const set = buildSet({
      packets: [record("s01", threeActs)],
      comparisons: [
        ...completeComparisons(["anchor-high", "s01", "anchor-low"]).filter(
          (saved) => !(saved.first === "anchor-low" && saved.second === "s01"),
        ),
        comparison("anchor-low", "s01", "anchor-low"),
      ],
    })

    expect(thinEvidenceReasons(set, set.packets[0])).toEqual(["50% of its pairs changed winner with the order shown"])
  })
})

describe("coverage", () => {
  const set = buildSet({
    packets: [record("s01", [act("Voted to hold coverage flat.")]), record("s02", [])],
    key: {
      revealingTerms: [],
      subjects: ["s01", "s02", "s03"].map((id) => ({
        id,
        name: `Subject ${id}`,
        kind: "member" as const,
        group: "Sample Caucus",
        legislature: "sample-house",
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
