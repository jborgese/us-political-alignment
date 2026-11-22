import type { Comparison, Evidence, RatingSet } from "../src/files.ts"

export const act = (text: string): Evidence => ({ tier: "official_act", text })

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
    anchors: [
      { id: "anchor-high", items: [act("Voted to expand public coverage to every resident.")] },
      { id: "anchor-low", items: [act("Voted to cut public coverage.")] },
    ],
  },
  packets: [{ id: "s01", items: [act("Voted to hold public coverage at current levels.")] }],
  key: {
    revealingTerms: ["Medicare", "US"],
    subjects: [{ id: "s01", name: "Jane Sample", kind: "member", group: "Sample Caucus", aliases: ["Sample"] }],
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
