import {
  currentComparisons,
  remainingMatchups,
  reversed,
  stabilityMatchups,
  stabilityRun,
  type Matchup,
} from "./comparisons.ts"
import type { Comparison, RatingSet, Rewording } from "./files.ts"
import { ratedPackets } from "./ratingSet.ts"
import { anchorsInOrder, fitBradleyTerry, toAnchoredScale, toOutcomes, type Scores } from "./scoring.ts"

export const LARGEST_MOVE_WHEN_REWORDED = 10
export const MOVE_THAT_NEEDS_BOTH_ORDERS = 6

export interface RewordedScore {
  baseId: string
  version: string
  score: number
}

export interface WordingRange {
  low: number
  high: number
}

const involves = (id: string) => (saved: Comparison): boolean => saved.first === id || saved.second === id

const scoreInPlaceOfBase = (set: RatingSet, rewording: Rewording, own: Comparison[]): number => {
  const anchorIds = set.category.anchors.map((anchor) => anchor.id)
  const ids = ratedPackets(set).map((packet) => (packet.id === rewording.baseId ? rewording.id : packet.id))
  const others = set.comparisons.filter((saved) => !involves(rewording.baseId)(saved))
  const fitted = fitBradleyTerry(ids, toOutcomes([...others, ...own]))
  return toAnchoredScale(fitted, anchorIds[0], anchorIds[anchorIds.length - 1])[rewording.id]
}

const rounded = (score: number): number => Math.round(score) || 0

const answers = (saved: Comparison, { first, second }: Matchup): boolean =>
  saved.first === first.id && saved.second === second.id

const secondOrders = (set: RatingSet): Matchup[] => {
  const anchorIds = set.category.anchors.map((anchor) => anchor.id)
  const fitted = fitBradleyTerry(
    ratedPackets(set).map((packet) => packet.id),
    toOutcomes(set.comparisons),
  )
  if (!anchorsInOrder(fitted, anchorIds)) return []
  const published = toAnchoredScale(fitted, anchorIds[0], anchorIds[anchorIds.length - 1])
  const rated = currentComparisons(stabilityRun(set))
  const firstOrders = stabilityMatchups(set)
  return set.rewordings.flatMap((rewording) => {
    const own = firstOrders.filter(({ first, second }) => first.id === rewording.id || second.id === rewording.id)
    const ownAnswers = rated.filter((saved) => own.some((matchup) => answers(saved, matchup)))
    if (ownAnswers.length < own.length) return []
    const score = scoreInPlaceOfBase(set, rewording, ownAnswers)
    const move = rounded(score) - rounded(published[rewording.baseId])
    return Math.abs(move) > MOVE_THAT_NEEDS_BOTH_ORDERS ? reversed(own) : []
  })
}

export const plannedStabilityMatchups = (set: RatingSet): Matchup[] => [...stabilityMatchups(set), ...secondOrders(set)]

export const remainingStabilityMatchups = (set: RatingSet): Matchup[] =>
  remainingMatchups(stabilityRun(set), plannedStabilityMatchups(set))

export const rewordedScores = (set: RatingSet): RewordedScore[] => {
  const rated = currentComparisons(stabilityRun(set))
  const unrated = remainingStabilityMatchups(set)
  return set.rewordings
    .filter(({ id }) => !unrated.some(({ first, second }) => first.id === id || second.id === id))
    .map((rewording) => ({
      baseId: rewording.baseId,
      version: rewording.version,
      score: scoreInPlaceOfBase(set, rewording, rated.filter(involves(rewording.id))),
    }))
}

const versionsOf = (set: RatingSet, reworded: RewordedScore[], baseId: string): number[] | undefined => {
  const scores = reworded.filter((version) => version.baseId === baseId).map((version) => rounded(version.score))
  const planned = set.rewordings.filter((rewording) => rewording.baseId === baseId).length
  return planned > 0 && scores.length === planned ? scores : undefined
}

export const wordingRange = (
  set: RatingSet,
  scores: Scores,
  reworded: RewordedScore[],
  baseId: string,
): WordingRange | undefined => {
  const versions = versionsOf(set, reworded, baseId)
  if (!versions) return undefined
  const all = [rounded(scores[baseId]), ...versions]
  return { low: Math.min(...all), high: Math.max(...all) }
}

export const wordingReasons = (set: RatingSet, scores: Scores, reworded: RewordedScore[], baseId: string): string[] => {
  const published = rounded(scores[baseId])
  const moves = (versionsOf(set, reworded, baseId) ?? []).map((score) => score - published)
  const largest = moves.toSorted((a, b) => Math.abs(b) - Math.abs(a))[0] ?? 0
  return Math.abs(largest) > LARGEST_MOVE_WHEN_REWORDED
    ? [
        `a reworded version scored ${Math.abs(largest)} points ${largest > 0 ? "higher" : "lower"}, more than ${LARGEST_MOVE_WHEN_REWORDED}`,
      ]
    : []
}
