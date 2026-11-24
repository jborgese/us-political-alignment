import { appendFile, mkdir, rm, writeFile } from "node:fs/promises"

import {
  buildComparisonMessage,
  buildSystemPrompt,
  currentComparisons,
  fingerprintRecords,
  remainingMatchups,
  stabilityMatchups,
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
import { createBatchRater, type RatedRequest } from "./rater.ts"
import { findSetProblems } from "./ratingSet.ts"

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

const collect = async (
  set: RatingSet,
  files: RunFiles,
  planned: Matchup[] | undefined,
  pending: PendingBatch,
): Promise<RateOutcome> => {
  const progress = await createBatchRater(pending.model).collect(pending.batchId)
  if (!progress.ended) {
    return { status: "waiting", batchId: pending.batchId, total: pending.requests.length, submittedAt: pending.submittedAt }
  }
  const rated = progress.rated.flatMap((result) => toComparison(pending, result))
  await appendFile(files.comparisons, asLines(rated))
  await rm(files.pendingBatch)
  return {
    status: "collected",
    rated: rated.length,
    failed: progress.failed.length,
    remaining: remainingMatchups({ ...set, comparisons: [...set.comparisons, ...rated] }, planned).length,
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
  const system = buildSystemPrompt(set.category.question)
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
  planned?: Matchup[]
}

const rateRun = async (run: Run, model: string, limit: number): Promise<RateOutcome> => {
  const set = await setAsideSuperseded(run.set, run.files)
  assertOneModel(set, run.categoryId, model)

  const pending = await loadPendingBatch(run.files.pendingBatch)
  if (pending) return collect(set, run.files, run.planned, pending)
  const unrated = remainingMatchups(set, run.planned)
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
  const unrated = remainingMatchups(set).length
  if (unrated > 0) {
    throw new Error(`Rate ${categoryId} before its rewordings: ${unrated} comparisons remain. Run rate first.`)
  }
  assertOneModel(set, categoryId, model)
  const files = {
    comparisons: paths.stability,
    superseded: paths.stabilitySuperseded,
    pendingBatch: paths.stabilityBatch,
  }
  return rateRun({ categoryId, set: stabilityRun(set), files, planned: stabilityMatchups(set) }, model, limit)
}
