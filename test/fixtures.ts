import type { Comparison, Evidence, Packet, RatingSet } from "../src/files.ts"

export const act = (text: string, slot = "acts"): Evidence => ({ slot, tier: "official_act", text })

export const record = (id: string, items: Evidence[], emptySlots: string[] = []): Packet => ({
  id,
  items,
  emptySlots,
})

export const comparison = (first: string, second: string, winner: string): Comparison => ({
  first,
  second,
  winner,
  reason: "The chosen record did more.",
  model: "model-a",
  ratedAt: "2026-11-22T00:00:00.000Z",
})

export const buildSet = (overrides: Partial<RatingSet> = {}): RatingSet => ({
  category: {
    title: "Test category",
    question: "Which record shows more support for public coverage?",
    highPole: "More support",
    lowPole: "Less support",
    slots: [{ id: "acts", heading: "Recorded acts" }],
    anchors: [
      record("anchor-high", [act("Voted to expand public coverage to every resident.")]),
      record("anchor-low", [act("Voted to cut public coverage.")]),
    ],
  },
  legislatures: [],
  packets: [record("s01", [act("Voted to hold public coverage at current levels.")])],
  key: {
    revealingTerms: ["Medicare", "US"],
    subjects: [
      {
        id: "s01",
        name: "Jane Sample",
        kind: "member",
        group: "Sample Caucus",
        legislature: "sample-house",
        aliases: ["Sample"],
      },
    ],
  },
  comparisons: [],
  ...overrides,
})

export const completeComparisons = (ranking: string[]): Comparison[] =>
  ranking.flatMap((first) =>
    ranking
      .filter((second) => second !== first)
      .map((second) =>
        comparison(first, second, ranking.indexOf(first) < ranking.indexOf(second) ? first : second),
      ),
  )
