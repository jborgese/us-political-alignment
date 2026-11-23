import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

import { z } from "zod"

export const TIERS = ["official_act", "influence", "statement"] as const
const MAX_ITEMS_PER_PACKET = 12

const sourcesSchema = z.array(z.url()).min(1)
const emptySlotsSchema = z.array(z.string().min(1)).default([])

const evidenceSchema = z.strictObject({
  slot: z.string().min(1),
  tier: z.enum(TIERS),
  text: z.string().min(1),
})

const stanceSchema = z.strictObject({
  event: z.string().min(1),
  stance: z.string().min(1),
  sources: sourcesSchema.optional(),
})

const packetSchema = z.strictObject({
  items: z.array(z.union([evidenceSchema.extend({ sources: sourcesSchema }), stanceSchema])).max(MAX_ITEMS_PER_PACKET),
  emptySlots: emptySlotsSchema,
})

const categorySchema = z.strictObject({
  title: z.string().min(1),
  question: z.string().min(1),
  highPole: z.string().min(1),
  lowPole: z.string().min(1),
  withheld: z.array(z.string().min(1)).default([]),
  slots: z.array(z.strictObject({ id: z.string().min(1), heading: z.string().min(1) })).min(1),
  anchors: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        items: z.array(evidenceSchema).min(1).max(MAX_ITEMS_PER_PACKET),
        emptySlots: emptySlotsSchema,
      }),
    )
    .min(2),
})

const eventsSchema = z.strictObject({
  legislatures: z.array(
    z.strictObject({
      id: z.string().min(1),
      events: z.array(
        z.strictObject({
          id: z.string().min(1),
          slot: z.string().min(1),
          text: z.string().min(1),
          sources: sourcesSchema,
        }),
      ),
    }),
  ),
})

const keySchema = z.strictObject({
  revealingTerms: z.array(z.string().min(1)),
  subjects: z.array(
    z.strictObject({
      id: z.string().min(1),
      name: z.string().min(1),
      kind: z.enum(["member", "party", "caucus"]),
      group: z.string().min(1),
      legislature: z.string().min(1),
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

type PacketFile = z.infer<typeof packetSchema>
type PacketItem = PacketFile["items"][number]

export type Tier = (typeof TIERS)[number]
export type Category = z.infer<typeof categorySchema>
export type Slot = Category["slots"][number]
export type Legislature = z.infer<typeof eventsSchema>["legislatures"][number]
export type PolicyEvent = Legislature["events"][number]
export type Key = z.infer<typeof keySchema>
export type Comparison = z.infer<typeof comparisonSchema>

export interface Evidence {
  slot: string
  tier: Tier
  text: string
  event?: string
  sources?: string[]
}

export interface Packet {
  id: string
  items: Evidence[]
  emptySlots: string[]
}

export interface RatingSet {
  category: Category
  legislatures: Legislature[]
  packets: Packet[]
  key: Key
  comparisons: Comparison[]
}

export interface CategoryPaths {
  category: string
  events: string
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
    events: path.join(root, "events", `${categoryId}.json`),
    packets: path.join(root, "packets", categoryId),
    key: path.join(root, "key.json"),
    runDir,
    comparisons: path.join(runDir, "comparisons.jsonl"),
    report: path.join(runDir, "report.md"),
    spotCheck: path.join(runDir, "spot-check.md"),
  }
}

export const eventsFor = (set: Pick<RatingSet, "legislatures" | "key">, subjectId: string): PolicyEvent[] => {
  const legislatureId = set.key.subjects.find((subject) => subject.id === subjectId)?.legislature
  return set.legislatures.find((legislature) => legislature.id === legislatureId)?.events ?? []
}

const parseAs = <Schema extends z.ZodType>(schema: Schema, value: unknown, origin: string): z.infer<Schema> => {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error(`${origin} is not valid:\n${z.prettifyError(result.error)}`)
  return result.data
}

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8"))

const loadPacketFiles = async (dir: string): Promise<{ file: string; content: PacketFile }[]> => {
  const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).toSorted()
  return Promise.all(
    names.map(async (name) => {
      const file = path.join(dir, name)
      return { file, content: parseAs(packetSchema, await readJson(file), file) }
    }),
  )
}

const toEvidence = (events: PolicyEvent[], origin: string, item: PacketItem): Evidence => {
  if (!("event" in item)) return item
  const event = events.find((candidate) => candidate.id === item.event)
  if (!event) throw new Error(`${origin} takes a stance on "${item.event}", which is not an event of its legislature`)
  return {
    slot: event.slot,
    tier: "official_act",
    text: `${item.stance} ${event.text}.`,
    event: event.id,
    sources: [...event.sources, ...(item.sources ?? [])],
  }
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
  const [category, { legislatures }, packetFiles, key, comparisons] = await Promise.all([
    readJson(paths.category).then((value) => parseAs(categorySchema, value, paths.category)),
    readJson(paths.events).then((value) => parseAs(eventsSchema, value, paths.events)),
    loadPacketFiles(paths.packets),
    readJson(paths.key).then((value) => parseAs(keySchema, value, paths.key)),
    loadComparisons(paths.comparisons),
  ])
  const packets = packetFiles.map(({ file, content }) => {
    const id = path.basename(file, ".json")
    const events = eventsFor({ legislatures, key }, id)
    return {
      id,
      items: content.items.map((item) => toEvidence(events, file, item)),
      emptySlots: content.emptySlots,
    }
  })
  return { category, legislatures, packets, key, comparisons }
}
