import { readFile, readdir } from "node:fs/promises"
import path from "node:path"

import { z } from "zod"

export const TIERS = ["official_act", "influence", "statement"] as const
export const CATEGORY_ID_PATTERN = /^[a-z0-9-]+$/
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
  weighing: z.string().min(1).optional(),
  highPole: z.string().min(1),
  lowPole: z.string().min(1),
  slots: z
    .array(z.strictObject({ id: z.string().min(1), heading: z.string().min(1), required: z.boolean().optional() }))
    .min(1),
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
      party: z.string().min(1).optional(),
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
  firstHash: z.string().min(1).optional(),
  secondHash: z.string().min(1).optional(),
})

const rewordingSchema = z.strictObject({
  events: z.record(z.string(), z.record(z.string(), z.string().min(1))),
  records: z.record(z.string(), z.array(z.string().min(1)).min(1)),
})

const plannedCategoriesSchema = z
  .array(
    z.strictObject({ id: z.string().regex(CATEGORY_ID_PATTERN), label: z.string().min(1), published: z.boolean() }),
  )
  .min(1)

const pendingBatchSchema = z.strictObject({
  batchId: z.string().min(1),
  model: z.string().min(1),
  submittedAt: z.iso.datetime(),
  requests: z.array(
    z.strictObject({
      id: z.string().min(1),
      first: z.string().min(1),
      second: z.string().min(1),
      firstHash: z.string().min(1),
      secondHash: z.string().min(1),
    }),
  ),
})

type PacketItem = z.infer<typeof packetSchema>["items"][number]

export type Tier = (typeof TIERS)[number]
export type Category = z.infer<typeof categorySchema>
export type Slot = Category["slots"][number]
export type Legislature = z.infer<typeof eventsSchema>["legislatures"][number]
export type PolicyEvent = Legislature["events"][number]
export type Key = z.infer<typeof keySchema>
export type Comparison = z.infer<typeof comparisonSchema>
export type PendingBatch = z.infer<typeof pendingBatchSchema>
export type PlannedCategory = z.infer<typeof plannedCategoriesSchema>[number]

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

export interface Rewording extends Packet {
  baseId: string
  version: string
}

export interface RatingSet {
  category: Category
  legislatures: Legislature[]
  packets: Packet[]
  rewordings: Rewording[]
  key: Key
  comparisons: Comparison[]
  superseded: Comparison[]
  stability: Comparison[]
  stabilitySuperseded: Comparison[]
}

export interface CategoryPaths {
  category: string
  events: string
  packets: string
  rewordings: string
  key: string
  runDir: string
  comparisons: string
  superseded: string
  pendingBatch: string
  stability: string
  stabilitySuperseded: string
  stabilityBatch: string
  report: string
  spotCheck: string
}

export const pathsFor = (root: string, categoryId: string): CategoryPaths => {
  const runDir = path.join(root, "runs", categoryId)
  return {
    category: path.join(root, "categories", `${categoryId}.json`),
    events: path.join(root, "events", `${categoryId}.json`),
    packets: path.join(root, "packets", categoryId),
    rewordings: path.join(root, "rewordings", categoryId),
    key: path.join(root, "key.json"),
    runDir,
    comparisons: path.join(runDir, "comparisons.jsonl"),
    superseded: path.join(runDir, "superseded.jsonl"),
    pendingBatch: path.join(runDir, "batch.json"),
    stability: path.join(runDir, "stability.jsonl"),
    stabilitySuperseded: path.join(runDir, "stability-superseded.jsonl"),
    stabilityBatch: path.join(runDir, "stability-batch.json"),
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

const loadJsonFiles = <Schema extends z.ZodType>(
  dir: string,
  names: string[],
  schema: Schema,
): Promise<{ file: string; content: z.infer<Schema> }[]> =>
  Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .toSorted()
      .map(async (name) => {
        const file = path.join(dir, name)
        return { file, content: parseAs(schema, await readJson(file), file) }
      }),
  )

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

const whenMissing =
  <Fallback>(fallback: Fallback) =>
  (error: NodeJS.ErrnoException): Fallback => {
    if (error.code === "ENOENT") return fallback
    throw error
  }

const readLinesIfPresent = async (file: string): Promise<string[]> => {
  const text = await readFile(file, "utf8").catch(whenMissing(""))
  return text.split("\n").filter((line) => line.trim() !== "")
}

const reword = (base: Packet, texts: string[], events: Record<string, string>, file: string): Rewording => {
  if (texts.length !== base.items.length) {
    throw new Error(`${file} gives ${texts.length} texts for ${base.id}, which has ${base.items.length} items`)
  }
  const version = path.basename(file, ".json")
  const wordingOf = (eventId: string): string => {
    if (!(eventId in events)) {
      throw new Error(`${file} has no wording for the event "${eventId}", which ${base.id} takes a stance on`)
    }
    return events[eventId]
  }
  return {
    id: `${base.id}.${version}`,
    baseId: base.id,
    version,
    emptySlots: base.emptySlots,
    items: base.items.map((item, index) => ({
      ...item,
      text: item.event === undefined ? texts[index] : `${texts[index]} ${wordingOf(item.event)}.`,
    })),
  }
}

export const loadPendingBatch = async (file: string): Promise<PendingBatch | undefined> => {
  const [text] = await readLinesIfPresent(file)
  return text === undefined ? undefined : parseAs(pendingBatchSchema, JSON.parse(text), file)
}

const loadComparisons = async (file: string): Promise<Comparison[]> =>
  (await readLinesIfPresent(file)).map((line, index) =>
    parseAs(comparisonSchema, JSON.parse(line), `${file} line ${index + 1}`),
  )

export const loadPlannedCategories = async (file: string): Promise<PlannedCategory[]> =>
  parseAs(plannedCategoriesSchema, await readJson(file), file)

export const loadRatingSet = async (root: string, categoryId: string): Promise<RatingSet> => {
  const paths = pathsFor(root, categoryId)
  const [
    category,
    { legislatures },
    packetFiles,
    rewordingFiles,
    key,
    comparisons,
    superseded,
    stability,
    stabilitySuperseded,
  ] = await Promise.all([
    readJson(paths.category).then((value) => parseAs(categorySchema, value, paths.category)),
    readJson(paths.events).then((value) => parseAs(eventsSchema, value, paths.events)),
    readdir(paths.packets).then((names) => loadJsonFiles(paths.packets, names, packetSchema)),
    readdir(paths.rewordings)
      .catch(whenMissing<string[]>([]))
      .then((names) => loadJsonFiles(paths.rewordings, names, rewordingSchema)),
    readJson(paths.key).then((value) => parseAs(keySchema, value, paths.key)),
    loadComparisons(paths.comparisons),
    loadComparisons(paths.superseded),
    loadComparisons(paths.stability),
    loadComparisons(paths.stabilitySuperseded),
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
  const rewordings = rewordingFiles.flatMap(({ file, content }) =>
    Object.entries(content.records).map(([baseId, texts]) => {
      const base = packets.find((packet) => packet.id === baseId)
      if (!base) throw new Error(`${file} rewords ${baseId}, which has no packet`)
      const legislatureId = key.subjects.find((subject) => subject.id === baseId)?.legislature ?? ""
      return reword(base, texts, content.events[legislatureId] ?? {}, file)
    }),
  )
  return { category, legislatures, packets, rewordings, key, comparisons, superseded, stability, stabilitySuperseded }
}
