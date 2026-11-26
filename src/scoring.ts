import type { Comparison } from "./files.ts"

const PRIOR_WINS = 0.1
const MAX_ITERATIONS = 1000
const TOLERANCE = 1e-9

export interface Outcome {
  winner: string
  loser: string
}

export type Scores = Record<string, number>

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

export const toOutcomes = (comparisons: Comparison[]): Outcome[] =>
  comparisons.map(({ first, second, winner }) => ({ winner, loser: winner === first ? second : first }))

const winsMatrix = (ids: string[], outcomes: Outcome[]): number[][] =>
  ids.map((winner) =>
    ids.map((loser) =>
      winner === loser
        ? 0
        : outcomes.filter((outcome) => outcome.winner === winner && outcome.loser === loser).length + PRIOR_WINS,
    ),
  )

const nextStrengths = (wins: number[][], strengths: number[]): number[] => {
  const raw = strengths.map((strength, i) => {
    const exposure = sum(strengths.map((other, j) => (wins[i][j] + wins[j][i]) / (strength + other)))
    return sum(wins[i]) / exposure
  })
  const geometricMean = Math.exp(sum(raw.map(Math.log)) / raw.length)
  return raw.map((value) => value / geometricMean)
}

const converge = (wins: number[][], strengths: number[], remaining: number): number[] => {
  const next = nextStrengths(wins, strengths)
  const shift = Math.max(...next.map((value, i) => Math.abs(Math.log(value) - Math.log(strengths[i]))))
  if (shift < TOLERANCE) return next
  if (remaining === 0) throw new Error("Bradley-Terry scores did not converge")
  return converge(wins, next, remaining - 1)
}

export const fitBradleyTerry = (ids: string[], outcomes: Outcome[]): Scores => {
  const strengths = converge(
    winsMatrix(ids, outcomes),
    ids.map(() => 1),
    MAX_ITERATIONS,
  )
  return Object.fromEntries(ids.map((id, i) => [id, Math.log(strengths[i])]))
}

const nextOwnStrength = (strength: number, games: { wins: number; played: number; other: number }[]): number =>
  sum(games.map(({ wins }) => wins + PRIOR_WINS)) /
  sum(games.map(({ played, other }) => (played + 2 * PRIOR_WINS) / (strength + other)))

const convergeOwn = (
  strength: number,
  games: { wins: number; played: number; other: number }[],
  remaining: number,
): number => {
  const next = nextOwnStrength(strength, games)
  if (Math.abs(Math.log(next) - Math.log(strength)) < TOLERANCE) return next
  if (remaining === 0) throw new Error("The placed record's score did not converge")
  return convergeOwn(next, games, remaining - 1)
}

export const fitAgainstFixed = (fixed: Scores, id: string, outcomes: Outcome[]): number => {
  const opponents = outcomes
    .flatMap(({ winner, loser }) => (winner === id ? [loser] : loser === id ? [winner] : []))
    .filter((opponent, index, all) => all.indexOf(opponent) === index)
  if (opponents.length === 0) throw new Error(`${id} has no comparisons to place it with`)
  const games = opponents.map((opponent) => {
    const against = outcomes.filter(
      ({ winner, loser }) => (winner === id && loser === opponent) || (winner === opponent && loser === id),
    )
    return {
      wins: against.filter(({ winner }) => winner === id).length,
      played: against.length,
      other: Math.exp(fixed[opponent]),
    }
  })
  return Math.log(convergeOwn(1, games, MAX_ITERATIONS))
}

export const anchorsInOrder = (scores: Scores, anchorIds: string[]): boolean =>
  anchorIds.slice(1).every((id, index) => scores[anchorIds[index]] > scores[id])

export const toAnchoredScale = (scores: Scores, highAnchorId: string, lowAnchorId: string): Scores => {
  const low = scores[lowAnchorId]
  const span = scores[highAnchorId] - low
  return Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, (100 * (score - low)) / span]))
}

export const shareOfPairsAgreeingAcrossOrders = (comparisons: Comparison[]): number => {
  const agreements = comparisons
    .filter((comparison) => comparison.first < comparison.second)
    .flatMap((comparison) =>
      comparisons
        .filter((mirror) => mirror.first === comparison.second && mirror.second === comparison.first)
        .map((mirror) => mirror.winner === comparison.winner),
    )
  return agreements.filter(Boolean).length / agreements.length
}

export const shareWonByFirstListed = (comparisons: Comparison[]): number =>
  comparisons.filter((comparison) => comparison.winner === comparison.first).length / comparisons.length

export const pickSpotChecks = (comparisons: Comparison[], count: number, random: () => number): Comparison[] =>
  comparisons
    .map((comparison) => ({ comparison, draw: random() }))
    .toSorted((a, b) => a.draw - b.draw)
    .slice(0, count)
    .map(({ comparison }) => comparison)
