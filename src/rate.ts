import { appendFile, mkdir } from "node:fs/promises"

import { buildComparisonMessage, buildSystemPrompt, remainingMatchups, type Matchup } from "./comparisons.ts"
import { loadRatingSet, pathsFor, type Comparison } from "./files.ts"
import { createRater, type Rater } from "./rater.ts"
import { findSetProblems } from "./ratingSet.ts"

const PROGRESS_INTERVAL = 25

export interface RateSummary {
  rated: number
  alreadyRated: number
}

const rateMatchup = async (rater: Rater, system: string, model: string, matchup: Matchup): Promise<Comparison> => {
  const verdict = await rater(system, buildComparisonMessage(matchup))
  return {
    first: matchup.first.id,
    second: matchup.second.id,
    winner: verdict.choice === "A" ? matchup.first.id : matchup.second.id,
    reason: verdict.reason,
    model,
    ratedAt: new Date().toISOString(),
  }
}

export const rateCategory = async (root: string, categoryId: string, model: string): Promise<RateSummary> => {
  const set = await loadRatingSet(root, categoryId)
  const problems = findSetProblems(set)
  if (problems.length > 0) throw new Error(`Fix these before rating:\n${problems.join("\n")}`)
  const otherModels = set.comparisons.map((comparison) => comparison.model).filter((used) => used !== model)
  if (otherModels.length > 0) {
    throw new Error(
      `runs/${categoryId} already holds ratings from ${otherModels[0]}. Use that model, or move the old run aside.`,
    )
  }

  const paths = pathsFor(root, categoryId)
  const pending = remainingMatchups(set)
  const rater = createRater(model)
  const system = buildSystemPrompt(set.category.question)
  await mkdir(paths.runDir, { recursive: true })
  for (const [index, matchup] of pending.entries()) {
    const comparison = await rateMatchup(rater, system, model, matchup)
    await appendFile(paths.comparisons, `${JSON.stringify(comparison)}\n`)
    if ((index + 1) % PROGRESS_INTERVAL === 0) console.log(`${index + 1} of ${pending.length} comparisons rated`)
  }
  return { rated: pending.length, alreadyRated: set.comparisons.length }
}
