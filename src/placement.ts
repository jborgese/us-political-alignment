import { currentComparisons, remainingMatchups, type Matchup } from "./comparisons.ts"
import type { RatingSet } from "./files.ts"
import { ratedPackets } from "./ratingSet.ts"
import { fitAgainstFixed, toAnchoredScale, toOutcomes, type Scores } from "./scoring.ts"

export const PANEL_SIZE = 10

export const choosePanel = (scores: Scores, eligibleIds: string[], size = PANEL_SIZE): string[] => {
  const ranked = eligibleIds.toSorted((a, b) => scores[b] - scores[a] || a.localeCompare(b))
  if (ranked.length <= size) return ranked
  return Array.from({ length: size }, (_, index) => ranked[Math.round((index * (ranked.length - 1)) / (size - 1))])
}

export const placementRun = (set: RatingSet): RatingSet => ({
  ...set,
  packets: [...set.packets, ...set.placements],
  comparisons: set.placed,
  superseded: set.placedSuperseded,
})

export const placementMatchups = (set: RatingSet, panelIds: string[]): Matchup[] => {
  const panel = ratedPackets(set).filter((packet) => panelIds.includes(packet.id))
  return set.placements
    .filter((placed) => placed.items.length > 0)
    .flatMap((placed) =>
      panel.flatMap((member) => [
        { first: placed, second: member },
        { first: member, second: placed },
      ]),
    )
}

export const remainingPlacementMatchups = (set: RatingSet, panelIds: string[]): Matchup[] =>
  remainingMatchups(placementRun(set), placementMatchups(set, panelIds))

interface FittedScale {
  fitted: Scores
  highAnchorId: string
  lowAnchorId: string
}

export const placedScores = (set: RatingSet, panelIds: string[], scale: FittedScale): Scores => {
  const unrated = remainingPlacementMatchups(set, panelIds)
  const outcomes = toOutcomes(currentComparisons(placementRun(set)))
  const placedIds = set.placements
    .filter((placed) => placed.items.length > 0)
    .map((placed) => placed.id)
    .filter((id) => !unrated.some(({ first, second }) => first.id === id || second.id === id))
  const strengths = Object.fromEntries(placedIds.map((id) => [id, fitAgainstFixed(scale.fitted, id, outcomes)]))
  const anchored = toAnchoredScale({ ...scale.fitted, ...strengths }, scale.highAnchorId, scale.lowAnchorId)
  return Object.fromEntries(placedIds.map((id) => [id, anchored[id]]))
}
