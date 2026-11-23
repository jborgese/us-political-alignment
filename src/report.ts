import { writeFile } from "node:fs/promises"

import { describeEvidence, fingerprintRecords, remainingMatchups } from "./comparisons.ts"
import { loadRatingSet, pathsFor, type Comparison, type Packet, type RatingSet, type Slot } from "./files.ts"
import { packetsWithoutEvidence, ratedPackets, subjectsWithoutPackets, thinEvidenceReasons } from "./ratingSet.ts"
import {
  anchorsInOrder,
  fitBradleyTerry,
  pickSpotChecks,
  shareOfPairsAgreeingAcrossOrders,
  shareWonByFirstListed,
  toAnchoredScale,
  toOutcomes,
  type Scores,
} from "./scoring.ts"

const SPOT_CHECK_COUNT = 10

export interface ReportPaths {
  report: string
  spotCheck: string
}

interface ScoreRow {
  name: string
  kind: string
  group: string
  score: number
}

const percent = (share: number): string => `${Math.round(share * 100)}%`

const wholeNumber = (score: number): string => String(Math.round(score) || 0)

const assertRatingIsComplete = (set: RatingSet): void => {
  const unrated = remainingMatchups(set).length
  if (unrated > 0) throw new Error(`Rating is not finished: ${unrated} comparisons remain. Run rate first.`)
  const ratedIds = ratedPackets(set).map((packet) => packet.id)
  const strayIds = set.comparisons
    .flatMap((comparison) => [comparison.first, comparison.second])
    .filter((id, index, ids) => !ratedIds.includes(id) && ids.indexOf(id) === index)
  if (strayIds.length > 0) {
    throw new Error(
      `The saved comparisons mention records that are no longer rated: ${strayIds.join(", ")}. Move the old run aside and rate again.`,
    )
  }
}

const scoreRows = (set: RatingSet, scores: Scores): ScoreRow[] => [
  ...set.category.anchors.map((anchor) => ({ name: anchor.id, kind: "anchor", group: "", score: scores[anchor.id] })),
  ...set.key.subjects
    .filter((subject) => subject.id in scores)
    .map((subject) => ({ name: subject.name, kind: subject.kind, group: subject.group, score: scores[subject.id] })),
]

const scoreTable = (set: RatingSet, scores: Scores): string[] => [
  "| Record | Kind | Group | Score |",
  "|---|---|---|---|",
  ...scoreRows(set, scores)
    .toSorted((a, b) => b.score - a.score)
    .map((row) => `| ${row.name} | ${row.kind} | ${row.group} | ${wholeNumber(row.score)} |`),
]

const namesOf = (set: RatingSet, ids: string[]): string =>
  set.key.subjects
    .filter((subject) => ids.includes(subject.id))
    .map((subject) => subject.name)
    .join(", ") || "none"

const thinEvidenceLines = (set: RatingSet): string[] => {
  const lines = set.packets
    .filter((packet) => packet.items.length > 0)
    .map((packet) => ({ packet, reasons: thinEvidenceReasons(set, packet) }))
    .filter(({ reasons }) => reasons.length > 0)
    .map(({ packet, reasons }) => `- ${namesOf(set, [packet.id])}: ${reasons.join("; ")}`)
  return lines.length > 0 ? lines : ["- none"]
}

export interface RunSummary {
  highAnchorId: string
  lowAnchorId: string
  scaleIsValid: boolean
  scores: Scores
  agreementAcrossOrders: number
  wonByFirstListed: number
}

export const summarizeRun = (set: RatingSet): RunSummary => {
  assertRatingIsComplete(set)
  const anchorIds = set.category.anchors.map((anchor) => anchor.id)
  const highAnchorId = anchorIds[0]
  const lowAnchorId = anchorIds[anchorIds.length - 1]
  const fitted = fitBradleyTerry(
    ratedPackets(set).map((packet) => packet.id),
    toOutcomes(set.comparisons),
  )
  return {
    highAnchorId,
    lowAnchorId,
    scaleIsValid: anchorsInOrder(fitted, anchorIds),
    scores: toAnchoredScale(fitted, highAnchorId, lowAnchorId),
    agreementAcrossOrders: shareOfPairsAgreeingAcrossOrders(set.comparisons),
    wonByFirstListed: shareWonByFirstListed(set.comparisons),
  }
}

const latestFirst = (a: Comparison, b: Comparison): number => b.ratedAt.localeCompare(a.ratedAt)

export const previousScores = (set: RatingSet): Scores | undefined => {
  const hashes = fingerprintRecords(set)
  const anchorIds = set.category.anchors.map((anchor) => anchor.id)
  const earlier = set.superseded.filter((saved) => saved.first in hashes && saved.second in hashes).toSorted(latestFirst)
  const anchorsChanged = earlier.some(
    (saved) =>
      (anchorIds.includes(saved.first) && saved.firstHash !== undefined && saved.firstHash !== hashes[saved.first]) ||
      (anchorIds.includes(saved.second) && saved.secondHash !== undefined && saved.secondHash !== hashes[saved.second]),
  )
  if (earlier.length === 0 || anchorsChanged) return undefined
  const answers = set.comparisons.map(
    (current) => earlier.find((saved) => saved.first === current.first && saved.second === current.second) ?? current,
  )
  return toAnchoredScale(
    fitBradleyTerry(Object.keys(hashes), toOutcomes(answers)),
    anchorIds[0],
    anchorIds[anchorIds.length - 1],
  )
}

export const buildReport = (set: RatingSet): string => {
  const { highAnchorId, lowAnchorId, scaleIsValid, scores, agreementAcrossOrders, wonByFirstListed } =
    summarizeRun(set)
  return [
    `# ${set.category.title}: rating report`,
    "",
    `Question put to the rater: ${set.category.question}`,
    "",
    `- Rater model: ${set.comparisons[0].model}`,
    `- Comparisons: ${set.comparisons.length}`,
    `- Scale: 100 is the ${highAnchorId} record (${set.category.highPole}). 0 is the ${lowAnchorId} record (${set.category.lowPole}). Scores can fall outside 0 to 100.`,
    "",
    "## Checks",
    "",
    `- Anchors came out in their intended order: ${scaleIsValid ? "yes" : "no"}`,
    `- Pairs where both presentation orders gave the same winner: ${percent(agreementAcrossOrders)}`,
    `- Comparisons won by the record listed first: ${percent(wonByFirstListed)} (50% means no position bias)`,
    "",
    "## Scores",
    "",
    ...(scaleIsValid
      ? scoreTable(set, scores)
      : ["Scores are withheld. The anchors did not come out in their intended order, so the scale is not valid."]),
    "",
    "## Held back from the site for thin evidence",
    "",
    ...thinEvidenceLines(set),
    "",
    "## Not rated",
    "",
    `- Packets with no evidence: ${namesOf(
      set,
      packetsWithoutEvidence(set).map((packet) => packet.id),
    )}`,
    `- Subjects with no packet: ${namesOf(set, subjectsWithoutPackets(set))}`,
    "",
  ].join("\n")
}

const spotCheckSection = (
  slots: Slot[],
  packets: Record<string, Packet>,
  comparison: Comparison,
  index: number,
): string[] => [
  `## Pair ${index + 1}`,
  "",
  "**Record A**",
  "",
  describeEvidence(packets[comparison.first], slots),
  "",
  "**Record B**",
  "",
  describeEvidence(packets[comparison.second], slots),
  "",
  "<details><summary>Rater's answer</summary>",
  "",
  `${comparison.winner === comparison.first ? "A" : "B"}. ${comparison.reason}`,
  "",
  "</details>",
  "",
]

export const buildSpotCheck = (set: RatingSet, random: () => number): string => {
  assertRatingIsComplete(set)
  const packets = Object.fromEntries(ratedPackets(set).map((packet) => [packet.id, packet]))
  return [
    `# ${set.category.title}: blinded spot check`,
    "",
    `Question: ${set.category.question}`,
    "",
    "Decide which record fits the question better before opening the rater's answer.",
    "",
    ...pickSpotChecks(set.comparisons, SPOT_CHECK_COUNT, random).flatMap((comparison, index) =>
      spotCheckSection(set.category.slots, packets, comparison, index),
    ),
  ].join("\n")
}

export const writeReports = async (root: string, categoryId: string, random: () => number): Promise<ReportPaths> => {
  const set = await loadRatingSet(root, categoryId)
  const paths = pathsFor(root, categoryId)
  await writeFile(paths.report, buildReport(set))
  await writeFile(paths.spotCheck, buildSpotCheck(set, random))
  return { report: paths.report, spotCheck: paths.spotCheck }
}
