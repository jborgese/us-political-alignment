import type { Matchup } from "./comparisons.ts"
import type { RatingSet } from "./files.ts"
import { ratedPackets } from "./ratingSet.ts"
import type { Scores } from "./scoring.ts"

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
