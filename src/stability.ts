import { currentComparisons, remainingStabilityMatchups, stabilityRun } from "./comparisons.ts"
import type { Comparison, RatingSet, Rewording } from "./files.ts"
import { ratedPackets } from "./ratingSet.ts"
import { fitBradleyTerry, toAnchoredScale, toOutcomes, type Scores } from "./scoring.ts"

export const LARGEST_MOVE_WHEN_REWORDED = 10

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

const rounded = (score: number): number => Math.round(score) || 0

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
