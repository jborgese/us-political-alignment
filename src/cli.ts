import process from "node:process"

import {
  estimateInputTokens,
  remainingMatchups,
  remainingStabilityMatchups,
  supersededComparisons,
} from "./comparisons.ts"
import { CATEGORY_ID_PATTERN, loadRatingSet } from "./files.ts"
import { rateCategory, rateStability, type RateOutcome } from "./rate.ts"
import { findSetProblems, packetsWithoutEvidence, ratedPackets, subjectsWithoutPackets } from "./ratingSet.ts"
import { writeReports } from "./report.ts"
import { writeSite } from "./site.ts"

const USAGE = [
  "Usage: node src/cli.ts <check|rate|stability|report> <category-id> [limit]",
  "       node src/cli.ts site",
].join("\n")

const check = async (root: string, categoryId: string): Promise<void> => {
  const set = await loadRatingSet(root, categoryId)
  const problems = findSetProblems(set)
  if (problems.length > 0) throw new Error(`${problems.length} problems found:\n${problems.join("\n")}`)
  const emptyIds = packetsWithoutEvidence(set).map((packet) => packet.id)
  console.log(`No problems found in ${categoryId}.`)
  console.log(`Records ready to rate, anchors included: ${ratedPackets(set).length}`)
  const unrated = remainingMatchups(set)
  console.log(`Comparisons still to rate: ${unrated.length}, about ${estimateInputTokens(set, unrated)} input tokens`)
  console.log(`Saved comparisons that a changed record has superseded: ${supersededComparisons(set).length}`)
  const unratedRewordings = remainingStabilityMatchups(set)
  console.log(`Reworded versions: ${set.rewordings.length}`)
  console.log(
    `Stability comparisons still to rate: ${unratedRewordings.length}, about ${estimateInputTokens(set, unratedRewordings)} input tokens`,
  )
  console.log(`Packets with no evidence: ${emptyIds.join(", ") || "none"}`)
  console.log(`Subjects with no packet: ${subjectsWithoutPackets(set).join(", ") || "none"}`)
}

const describeOutcome = (outcome: RateOutcome): string => {
  if (outcome.status === "complete") return "Every comparison is already rated."
  if (outcome.status === "submitted") {
    return `Submitted ${outcome.count} comparisons as batch ${outcome.batchId}. ${outcome.remaining} more are not yet submitted. Run the same command again later to collect the answers.`
  }
  if (outcome.status === "waiting") {
    return `Batch ${outcome.batchId} is still running: ${outcome.finished} of ${outcome.total} comparisons finished. Run the same command again later.`
  }
  return `Collected ${outcome.rated} answers. ${outcome.failed} failed and ${outcome.remaining} comparisons remain; run the same command again to submit them.`
}

const rateWith =
  (rater: typeof rateCategory) =>
  async (root: string, categoryId: string, limit?: string): Promise<void> => {
    const model = process.env.RATER_MODEL
    if (!model) throw new Error("Set RATER_MODEL to the model that should rate. See .env.example.")
    if (limit !== undefined && !/^[1-9]\d*$/.test(limit)) throw new Error(USAGE)
    console.log(describeOutcome(await rater(root, categoryId, model, limit === undefined ? undefined : Number(limit))))
  }

const report = async (root: string, categoryId: string): Promise<void> => {
  const paths = await writeReports(root, categoryId, Math.random)
  console.log(`Report with names: ${paths.report}`)
  console.log(`Blinded spot check: ${paths.spotCheck}`)
}

const site = async (root: string): Promise<void> => {
  const files = await writeSite(root)
  console.log(files.map((file) => `Site page: ${file}`).join("\n"))
}

const COMMANDS = [
  { name: "check", run: check },
  { name: "rate", run: rateWith(rateCategory) },
  { name: "stability", run: rateWith(rateStability) },
  { name: "report", run: report },
]

const main = async (args: string[]): Promise<void> => {
  const [commandName, categoryId, limit] = args
  if (commandName === "site") {
    if (categoryId !== undefined) console.log(`The site holds every rated category, so "${categoryId}" is ignored.`)
    return site(process.cwd())
  }
  const command = COMMANDS.find((candidate) => candidate.name === commandName)
  if (!command || !categoryId || !CATEGORY_ID_PATTERN.test(categoryId)) throw new Error(USAGE)
  await command.run(process.cwd(), categoryId, limit)
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
