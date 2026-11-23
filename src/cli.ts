import process from "node:process"

import { remainingMatchups } from "./comparisons.ts"
import { loadRatingSet } from "./files.ts"
import { rateCategory } from "./rate.ts"
import { findSetProblems, packetsWithoutEvidence, ratedPackets, subjectsWithoutPackets } from "./ratingSet.ts"
import { writeReports } from "./report.ts"
import { writeSite } from "./site.ts"

const USAGE = "Usage: node src/cli.ts <check|rate|report|site> <category-id>"
const CATEGORY_ID_PATTERN = /^[a-z0-9-]+$/

const check = async (root: string, categoryId: string): Promise<void> => {
  const set = await loadRatingSet(root, categoryId)
  const problems = findSetProblems(set)
  if (problems.length > 0) throw new Error(`${problems.length} problems found:\n${problems.join("\n")}`)
  const emptyIds = packetsWithoutEvidence(set).map((packet) => packet.id)
  console.log(`No problems found in ${categoryId}.`)
  console.log(`Records ready to rate, anchors included: ${ratedPackets(set).length}`)
  console.log(`Comparisons still to rate: ${remainingMatchups(set).length}`)
  console.log(`Packets with no evidence: ${emptyIds.join(", ") || "none"}`)
  console.log(`Subjects with no packet: ${subjectsWithoutPackets(set).join(", ") || "none"}`)
}

const rate = async (root: string, categoryId: string): Promise<void> => {
  const model = process.env.RATER_MODEL
  if (!model) throw new Error("Set RATER_MODEL to the model that should rate. See .env.example.")
  const summary = await rateCategory(root, categoryId, model)
  console.log(`Rated ${summary.rated} comparisons with ${model}. ${summary.alreadyRated} were already rated.`)
}

const report = async (root: string, categoryId: string): Promise<void> => {
  const paths = await writeReports(root, categoryId, Math.random)
  console.log(`Report with names: ${paths.report}`)
  console.log(`Blinded spot check: ${paths.spotCheck}`)
}

const site = async (root: string, categoryId: string): Promise<void> => {
  console.log(`Site page: ${await writeSite(root, categoryId)}`)
}

const COMMANDS = [
  { name: "check", run: check },
  { name: "rate", run: rate },
  { name: "report", run: report },
  { name: "site", run: site },
]

const main = async (args: string[]): Promise<void> => {
  const [commandName, categoryId] = args
  const command = COMMANDS.find((candidate) => candidate.name === commandName)
  if (!command || !categoryId || !CATEGORY_ID_PATTERN.test(categoryId)) throw new Error(USAGE)
  await command.run(process.cwd(), categoryId)
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
