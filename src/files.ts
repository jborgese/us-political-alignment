import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

import { z } from "zod"

export const TIERS = ["official_act", "influence", "statement"] as const
const MAX_ITEMS_PER_PACKET = 12

const evidenceSchema = z.strictObject({
  tier: z.enum(TIERS),
  text: z.string().min(1),
})

const packetSchema = z.strictObject({
  items: z.array(evidenceSchema.extend({ sources: z.array(z.url()).min(1) })).max(MAX_ITEMS_PER_PACKET),
})

const categorySchema = z.strictObject({
  title: z.string().min(1),
  question: z.string().min(1),
  highPole: z.string().min(1),
  lowPole: z.string().min(1),
  anchors: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        items: z.array(evidenceSchema).min(1).max(MAX_ITEMS_PER_PACKET),
      }),
    )
    .min(2),
})

const keySchema = z.strictObject({
  revealingTerms: z.array(z.string().min(1)),
  subjects: z.array(
    z.strictObject({
      id: z.string().min(1),
      name: z.string().min(1),
      kind: z.enum(["member", "party", "caucus"]),
      group: z.string().min(1),
      aliases: z.array(z.string().min(1)),
    }),
  ),
})

const comparisonSchema = z.strictObject({
  first: z.string().min(1),
  second: z.string().min(1),
  winner: z.string().min(1),
  reason: z.string(),
  model: z.string().min(1),
  ratedAt: z.iso.datetime(),
})

export type Tier = (typeof TIERS)[number]
export type Evidence = z.infer<typeof evidenceSchema>
export type Category = z.infer<typeof categorySchema>
export type Key = z.infer<typeof keySchema>
export type Comparison = z.infer<typeof comparisonSchema>

export interface Packet {
  id: string
  items: Evidence[]
}

export interface RatingSet {
  category: Category
  packets: Packet[]
  key: Key
  comparisons: Comparison[]
}

export interface CategoryPaths {
  category: string
  packets: string
  key: string
  runDir: string
  comparisons: string
  report: string
  spotCheck: string
}

export const pathsFor = (root: string, categoryId: string): CategoryPaths => {
  const runDir = path.join(root, "runs", categoryId)
  return {
    category: path.join(root, "categories", `${categoryId}.json`),
    packets: path.join(root, "packets", categoryId),
    key: path.join(root, "key.json"),
    runDir,
    comparisons: path.join(runDir, "comparisons.jsonl"),
    report: path.join(runDir, "report.md"),
    spotCheck: path.join(runDir, "spot-check.md"),
  }
}

const parseAs = <Schema extends z.ZodType>(schema: Schema, value: unknown, origin: string): z.infer<Schema> => {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error(`${origin} is not valid:\n${z.prettifyError(result.error)}`)
  return result.data
}

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8"))

const loadPacket = async (file: string): Promise<Packet> => ({
  id: path.basename(file, ".json"),
  ...parseAs(packetSchema, await readJson(file), file),
})

const loadPackets = async (dir: string): Promise<Packet[]> => {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).toSorted()
  return Promise.all(names.map((name) => loadPacket(path.join(dir, name))))
}

const readLinesIfPresent = async (file: string): Promise<string[]> => {
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return ""
    throw error
  })
  return text.split("\n").filter((line) => line.trim() !== "")
}

const loadComparisons = async (file: string): Promise<Comparison[]> =>
  (await readLinesIfPresent(file)).map((line, index) =>
    parseAs(comparisonSchema, JSON.parse(line), `${file} line ${index + 1}`),
  )

export const loadRatingSet = async (root: string, categoryId: string): Promise<RatingSet> => {
  const paths = pathsFor(root, categoryId)
  const [category, packets, key, comparisons] = await Promise.all([
    readJson(paths.category).then((value) => parseAs(categorySchema, value, paths.category)),
    loadPackets(paths.packets),
    readJson(paths.key).then((value) => parseAs(keySchema, value, paths.key)),
    loadComparisons(paths.comparisons),
  ])
  return { category, packets, key, comparisons }
}
