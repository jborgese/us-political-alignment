import { currentComparisons, remainingMatchups, type Matchup } from "./comparisons.ts"
import { TIERS, type Evidence, type Packet, type RatingSet } from "./files.ts"
import { ratedPackets } from "./ratingSet.ts"
import { fitAgainstFixed, toAnchoredScale, toOutcomes, type Outcome, type Scores } from "./scoring.ts"

export const PANEL_SIZE = 10
const CUT_MARK = "~"

export const choosePanel = (scores: Scores, eligibleIds: string[], size = PANEL_SIZE): string[] => {
  const ranked = eligibleIds.toSorted((a, b) => scores[b] - scores[a] || a.localeCompare(b))
  if (ranked.length <= size) return ranked
  return Array.from({ length: size }, (_, index) => ranked[Math.round((index * (ranked.length - 1)) / (size - 1))])
}

const cutRank = (item: Evidence): number => TIERS.indexOf(item.tier) * 2 + (item.event === undefined ? 0 : 1)

const cutTo = (member: Packet, size: number): Packet => {
  if (member.items.length <= size) return member
  const kept = member.items.toSorted((a, b) => cutRank(a) - cutRank(b)).slice(0, size)
  return { ...member, id: `${member.id}${CUT_MARK}${size}`, items: member.items.filter((item) => kept.includes(item)) }
}

export const placementMatchups = (set: RatingSet, panelIds: string[]): Matchup[] => {
  const panel = ratedPackets(set).filter((packet) => panelIds.includes(packet.id))
  return set.placements
    .filter((placed) => placed.items.length > 0)
    .flatMap((placed) =>
      panel
        .map((member) => cutTo(member, placed.items.length))
        .flatMap((member) => [
          { first: placed, second: member },
          { first: member, second: placed },
        ]),
    )
}

const cutPanel = (set: RatingSet, panelIds: string[]): Packet[] =>
  placementMatchups(set, panelIds)
    .map(({ second }) => second)
    .filter(
      (packet, index, all) =>
        packet.id.includes(CUT_MARK) && all.findIndex((other) => other.id === packet.id) === index,
    )

export const placementRun = (set: RatingSet, panelIds: string[]): RatingSet => ({
  ...set,
  packets: [...set.packets, ...set.placements, ...cutPanel(set, panelIds)],
  comparisons: set.placed,
  superseded: set.placedSuperseded,
})

export const remainingPlacementMatchups = (set: RatingSet, panelIds: string[]): Matchup[] =>
  remainingMatchups(placementRun(set, panelIds), placementMatchups(set, panelIds))

interface FittedScale {
  fitted: Scores
  highAnchorId: string
  lowAnchorId: string
}

const panelIdOf = (id: string): string => id.split(CUT_MARK)[0]

const againstFullRecords = ({ winner, loser }: Outcome): Outcome => ({
  winner: panelIdOf(winner),
  loser: panelIdOf(loser),
})

export const placedScores = (set: RatingSet, panelIds: string[], scale: FittedScale): Scores => {
  const unrated = remainingPlacementMatchups(set, panelIds)
  const outcomes = toOutcomes(currentComparisons(placementRun(set, panelIds))).map(againstFullRecords)
  const placedIds = set.placements
    .filter((placed) => placed.items.length > 0)
    .map((placed) => placed.id)
    .filter((id) => !unrated.some(({ first, second }) => first.id === id || second.id === id))
  const strengths = Object.fromEntries(placedIds.map((id) => [id, fitAgainstFixed(scale.fitted, id, outcomes)]))
  const anchored = toAnchoredScale({ ...scale.fitted, ...strengths }, scale.highAnchorId, scale.lowAnchorId)
  return Object.fromEntries(placedIds.map((id) => [id, anchored[id]]))
}
