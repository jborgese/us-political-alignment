import { appendFile, mkdir, rm, writeFile } from "node:fs/promises"

import {
  buildComparisonMessage,
  buildSystemPrompt,
  currentComparisons,
  fingerprintRecords,
  remainingMatchups,
  stabilityRun,
  supersededComparisons,
  type Matchup,
} from "./comparisons.ts"
import {
  loadPendingBatch,
  loadRatingSet,
  pathsFor,
  type CategoryPaths,
  type Comparison,
  type PendingBatch,
  type RatingSet,
} from "./files.ts"
import { choosePanel, placementMatchups, placementRun } from "./placement.ts"
import { createBatchRater, type RatedRequest } from "./rater.ts"
import { findSetProblems } from "./ratingSet.ts"
import { heldBackReasons, summarizeRun, type RunSummary } from "./report.ts"
import { plannedStabilityMatchups } from "./stability.ts"

export type RateOutcome =
  | { status: "complete" }
  | { status: "submitted"; batchId: string; count: number; remaining: number }
  | { status: "waiting"; batchId: string; total: number; submittedAt: string }
  | { status: "collected"; rated: number; failed: number; remaining: number }

type RunFiles = Pick<CategoryPaths, "comparisons" | "superseded" | "pendingBatch">

const asLines = (comparisons: Comparison[]): string => comparisons.map((saved) => `${JSON.stringify(saved)}\n`).join("")

const setAsideSuperseded = async (set: RatingSet, files: RunFiles): Promise<RatingSet> => {
  const superseded = supersededComparisons(set)
  if (superseded.length === 0) return set
  const current = currentComparisons(set)
  await appendFile(files.superseded, asLines(superseded))
  await writeFile(files.comparisons, asLines(current))
  return { ...set, comparisons: current }
}

const assertFullyRated = (set: RatingSet, categoryId: string, before: string): void => {
  const unrated = remainingMatchups(set).length
  if (unrated > 0) {
    throw new Error(`Rate ${categoryId} before ${before}: ${unrated} comparisons remain. Run rate first.`)
  }
}

const assertOneModel = (set: RatingSet, categoryId: string, model: string): void => {
  const other = set.comparisons.map((saved) => saved.model).find((used) => used !== model)
  if (other !== undefined) {
    throw new Error(`runs/${categoryId} already holds ratings from ${other}. Use that model, or move the old run aside.`)
  }
}

const toComparison = (pending: PendingBatch, { id, verdict }: RatedRequest): Comparison[] =>
  pending.requests
    .filter((request) => request.id === id)
    .map((request) => ({
      first: request.first,
      second: request.second,
      winner: verdict.choice === "A" ? request.first : request.second,
      reason: verdict.reason,
      model: pending.model,
      ratedAt: new Date().toISOString(),
      firstHash: request.firstHash,
      secondHash: request.secondHash,
    }))

type Plan = (comparisons: Comparison[]) => Matchup[]

const collect = async (
  set: RatingSet,
  files: RunFiles,
  plan: Plan | undefined,
  pending: PendingBatch,
): Promise<RateOutcome> => {
  const progress = await createBatchRater(pending.model).collect(pending.batchId)
  if (!progress.ended) {
    return { status: "waiting", batchId: pending.batchId, total: pending.requests.length, submittedAt: pending.submittedAt }
  }
  const rated = progress.rated.flatMap((result) => toComparison(pending, result))
  await appendFile(files.comparisons, asLines(rated))
  await rm(files.pendingBatch)
  const comparisons = [...set.comparisons, ...rated]
  return {
    status: "collected",
    rated: rated.length,
    failed: progress.failed.length,
    remaining: remainingMatchups({ ...set, comparisons }, plan?.(comparisons)).length,
  }
}

const submit = async (
  set: RatingSet,
  files: RunFiles,
  model: string,
  matchups: Matchup[],
  remaining: number,
): Promise<RateOutcome> => {
  const hashes = fingerprintRecords(set)
  const system = buildSystemPrompt(set.category)
  const requests = matchups.map(({ first, second }, index) => ({
    id: `pair-${index}`,
    first: first.id,
    second: second.id,
    firstHash: hashes[first.id],
    secondHash: hashes[second.id],
  }))
  const batchId = await createBatchRater(model).submit(
    matchups.map((matchup, index) => ({
      id: requests[index].id,
      system,
      message: buildComparisonMessage(matchup, set.category.slots),
    })),
  )
  const pending: PendingBatch = { batchId, model, submittedAt: new Date().toISOString(), requests }
  await writeFile(files.pendingBatch, `${JSON.stringify(pending)}\n`)
  return { status: "submitted", batchId, count: matchups.length, remaining: remaining - matchups.length }
}

interface Run {
  categoryId: string
  set: RatingSet
  files: RunFiles
  plan?: Plan
}

const rateRun = async (run: Run, model: string, limit: number): Promise<RateOutcome> => {
  const set = await setAsideSuperseded(run.set, run.files)
  assertOneModel(set, run.categoryId, model)

  const pending = await loadPendingBatch(run.files.pendingBatch)
  if (pending) return collect(set, run.files, run.plan, pending)
  const unrated = remainingMatchups(set, run.plan?.(set.comparisons))
  if (unrated.length === 0) return { status: "complete" }
  return submit(set, run.files, model, unrated.slice(0, limit), unrated.length)
}

const loadForRating = async (root: string, categoryId: string): Promise<{ set: RatingSet; paths: CategoryPaths }> => {
  const paths = pathsFor(root, categoryId)
  const set = await loadRatingSet(root, categoryId)
  const problems = findSetProblems(set)
  if (problems.length > 0) throw new Error(`Fix these before rating:\n${problems.join("\n")}`)
  await mkdir(paths.runDir, { recursive: true })
  return { set, paths }
}

export const rateCategory = async (
  root: string,
  categoryId: string,
  model: string,
  limit = Number.POSITIVE_INFINITY,
): Promise<RateOutcome> => {
  const { set, paths } = await loadForRating(root, categoryId)
  return rateRun({ categoryId, set, files: paths }, model, limit)
}

export const rateStability = async (
  root: string,
  categoryId: string,
  model: string,
  limit = Number.POSITIVE_INFINITY,
): Promise<RateOutcome> => {
  const { set, paths } = await loadForRating(root, categoryId)
  assertFullyRated(set, categoryId, "its rewordings")
  assertOneModel(set, categoryId, model)
  const files = {
    comparisons: paths.stability,
    superseded: paths.stabilitySuperseded,
    pendingBatch: paths.stabilityBatch,
  }
  const plan = (stability: Comparison[]): Matchup[] => plannedStabilityMatchups({ ...set, stability })
  return rateRun({ categoryId, set: stabilityRun(set), files, plan }, model, limit)
}

const panelCandidates = (set: RatingSet, run: RunSummary): string[] => [
  ...set.category.anchors.map((anchor) => anchor.id),
  ...set.packets
    .filter((packet) => packet.items.length > 0 && heldBackReasons(set, run, packet).length === 0)
    .map((packet) => packet.id),
]

export const panelFor = (set: RatingSet): string[] | null => {
  if (set.panel) return set.panel
  if (remainingMatchups(set).length > 0) return null
  const run = summarizeRun(set)
  return run.scaleIsValid ? choosePanel(run.scores, panelCandidates(set, run)) : null
}

export const placeRecords = async (
  root: string,
  categoryId: string,
  model: string,
  limit = Number.POSITIVE_INFINITY,
): Promise<RateOutcome> => {
  const { set, paths } = await loadForRating(root, categoryId)
  if (!set.placements.some((placed) => placed.items.length > 0)) {
    throw new Error(`placements/${categoryId} holds no records with evidence to place.`)
  }
  assertFullyRated(set, categoryId, "placing records on it")
  assertOneModel(set, categoryId, model)
  const panel = panelFor(set)
  if (!panel) throw new Error(`The anchors of ${categoryId} came out of order, so it has no scale to place records on.`)
  if (!set.panel) {
    await writeFile(paths.panel, `${JSON.stringify({ chosenAt: new Date().toISOString(), ids: panel }, null, 2)}\n`)
  }
  const files = { comparisons: paths.placed, superseded: paths.placedSuperseded, pendingBatch: paths.placedBatch }
  return rateRun({ categoryId, set: placementRun(set), files, plan: () => placementMatchups(set, panel) }, model, limit)
}
