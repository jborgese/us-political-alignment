import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { placeRecords, rateCategory, rateStability } from "../src/rate.ts"
import { createBatchRater, type BatchProgress, type RatingRequest } from "../src/rater.ts"

vi.mock("../src/rater.ts", () => ({ createBatchRater: vi.fn() }))

const CATEGORY_ID = "test-category"

const source = "https://example.org/record"

const category = {
  title: "Test category",
  question: "Which record shows more support for public coverage?",
  highPole: "More support",
  lowPole: "Less support",
  slots: [{ id: "acts", heading: "Recorded acts" }],
  anchors: [
    { id: "anchor-high", items: [{ slot: "acts", tier: "official_act", text: "Voted to expand public coverage." }] },
    { id: "anchor-low", items: [{ slot: "acts", tier: "official_act", text: "Voted to cut public coverage." }] },
  ],
}

const budgetEvent = {
  id: "event-one",
  slot: "acts",
  text: "a budget that cut public coverage by 5 percent",
  sources: [source],
}

const key = {
  revealingTerms: ["Medicare"],
  subjects: ["s01", "s02", "s03"].map((id) => ({
    id,
    name: `Subject ${id}`,
    kind: "member",
    group: "Sample Caucus",
    legislature: "sample-house",
    aliases: [],
  })),
}

const eventsFile = (root: string): string => path.join(root, "events", `${CATEGORY_ID}.json`)
const packetFile = (root: string, id: string): string => path.join(root, "packets", CATEGORY_ID, `${id}.json`)

const writeEvents = (root: string, events: (typeof budgetEvent)[]): Promise<void> =>
  writeFile(eventsFile(root), JSON.stringify({ legislatures: [{ id: "sample-house", events }] }))

const writeProject = async (packets: Record<string, string[]>): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "alignment-rater-"))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  const packetDir = path.dirname(packetFile(root, "s01"))
  await mkdir(path.join(root, "categories"))
  await mkdir(path.join(root, "events"))
  await mkdir(packetDir, { recursive: true })
  await writeFile(path.join(root, "categories", `${CATEGORY_ID}.json`), JSON.stringify(category))
  await writeEvents(root, [])
  await writeFile(path.join(root, "key.json"), JSON.stringify(key))
  await Promise.all(
    Object.entries(packets).map(([id, texts]) =>
      writeFile(
        packetFile(root, id),
        JSON.stringify({
          items: texts.map((text) => ({ slot: "acts", tier: "official_act", text, sources: [source] })),
        }),
      ),
    ),
  )
  return root
}

const writeRewording = async (
  root: string,
  records: Record<string, string[]>,
  events: Record<string, string> = {},
): Promise<void> => {
  const dir = path.join(root, "rewordings", CATEGORY_ID)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, "a.json"), JSON.stringify({ events: { "sample-house": events }, records }))
}

const writePlacement = async (root: string, id: string, texts: string[]): Promise<void> => {
  const dir = path.join(root, "placements", CATEGORY_ID)
  await mkdir(dir, { recursive: true })
  await writeFile(
    path.join(dir, `${id}.json`),
    JSON.stringify({ items: texts.map((text) => ({ slot: "acts", tier: "official_act", text, sources: [source] })) }),
  )
}

const savedRows = async (root: string, file: string): Promise<{ first: string; second: string; winner: string }[]> => {
  const text = await readFile(path.join(root, "runs", CATEGORY_ID, file), "utf8").catch(() => "")
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line))
}

const submit = vi.fn(async (_requests: RatingRequest[]) => "batch-1")
const collect = vi.fn(async (_batchId: string): Promise<BatchProgress> => ({ ended: false, processing: 0 }))

const lastSubmitted = (): RatingRequest[] => submit.mock.calls.at(-1)?.[0] ?? []

const answersFor = (requests: RatingRequest[]): Extract<BatchProgress, { ended: true }> => ({
  ended: true,
  rated: requests.map(({ id }) => ({ id, verdict: { choice: "A", reason: "The first record did more." } })),
  failed: [],
})

const TEXTS_FROM_STRONGEST = [
  "Cast a vote for keeping coverage level.",
  "Voted to expand public coverage.",
  "Voted to widen coverage.",
  "Voted to hold coverage flat.",
  "Voted to cut public coverage.",
]

const strengthOf = (recordText: string): number =>
  TEXTS_FROM_STRONGEST.findIndex((known) => recordText.includes(known))

const rankedAnswers = (requests: RatingRequest[]): Extract<BatchProgress, { ended: true }> => ({
  ended: true,
  rated: requests.map(({ id, message }) => {
    const [recordA, recordB] = message.split("<record_b>")
    const choice = strengthOf(recordA) < strengthOf(recordB) ? "A" : "B"
    return { id, verdict: { choice, reason: "The chosen record did more." } }
  }),
  failed: [],
})

const sentText = (): string =>
  lastSubmitted()
    .map((request) => `${request.system}\n${request.message}`)
    .join("\n")

const rate = (root: string, limit?: number) => rateCategory(root, CATEGORY_ID, "model-a", limit)

const rateFully = async (root: string) => {
  await rate(root)
  return rate(root)
}

const rateRewordings = (root: string, limit?: number) => rateStability(root, CATEGORY_ID, "model-a", limit)

const place = (root: string, limit?: number) => placeRecords(root, CATEGORY_ID, "model-a", limit)

beforeEach(() => {
  vi.clearAllMocks()
  collect.mockImplementation(async () => answersFor(lastSubmitted()))
  vi.mocked(createBatchRater).mockReturnValue({ submit, collect })
})

describe("rateCategory", () => {
  it("submits every unrated pair, then saves each answer once the batch has ended", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })

    const submitted = await rate(root)
    const savedBeforeCollecting = await savedRows(root, "comparisons.jsonl")
    const collected = await rate(root)

    expect(submitted).toEqual({ status: "submitted", batchId: "batch-1", count: 6, remaining: 0 })
    expect(savedBeforeCollecting).toEqual([])
    expect(collected).toEqual({ status: "collected", rated: 6, failed: 0, remaining: 0 })
    const saved = await savedRows(root, "comparisons.jsonl")
    expect(saved).toHaveLength(6)
    expect(saved.every((row) => row.winner === row.first)).toBe(true)
  })

  it("sends the rater evidence text without ids or sources", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })

    await rate(root)

    expect(sentText()).toContain("Voted to hold coverage flat.")
    expect(sentText()).not.toContain("s01")
    expect(sentText()).not.toContain("anchor-high")
    expect(sentText()).not.toContain("example.org")
    expect(lastSubmitted().map((request) => request.id).join(" ")).not.toContain("s01")
  })

  it("waits while the batch is still running", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await rate(root)
    collect.mockResolvedValueOnce({ ended: false, processing: 4 })

    const waiting = await rate(root)

    expect(waiting).toEqual({ status: "waiting", batchId: "batch-1", total: 6, submittedAt: expect.any(String) })
    expect(await savedRows(root, "comparisons.jsonl")).toEqual([])
    expect(await rate(root)).toMatchObject({ status: "collected", rated: 6 })
  })

  it("submits a failed comparison again on the next run", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await rate(root)
    const [failed, ...answered] = lastSubmitted()
    collect.mockResolvedValueOnce({ ...answersFor(answered), failed: [failed.id] })

    const collected = await rate(root)
    const resubmitted = await rate(root)

    expect(collected).toEqual({ status: "collected", rated: 5, failed: 1, remaining: 1 })
    expect(resubmitted).toMatchObject({ status: "submitted", count: 1, remaining: 0 })
  })

  it("submits no more comparisons than the limit", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })

    expect(await rate(root, 2)).toMatchObject({ status: "submitted", count: 2, remaining: 4 })
  })

  it("has nothing to submit once every pair is rated", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await rateFully(root)

    expect(await rate(root)).toEqual({ status: "complete" })
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it("rates again only the pairs that touch a changed record", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await rateFully(root)
    await writeFile(
      packetFile(root, "s01"),
      JSON.stringify({ items: [{ slot: "acts", tier: "official_act", text: "Voted to expand coverage.", sources: [source] }] }),
    )

    const resubmitted = await rate(root)

    expect(resubmitted).toMatchObject({ status: "submitted", count: 4, remaining: 0 })
    expect(await savedRows(root, "superseded.jsonl")).toHaveLength(4)
    expect(await savedRows(root, "comparisons.jsonl")).toHaveLength(2)
  })

  it("refuses to rate when a packet names a revealing term", async () => {
    const root = await writeProject({ s01: ["Voted to expand Medicare."] })

    await expect(rate(root)).rejects.toThrow('s01 mentions "Medicare"')
    expect(createBatchRater).not.toHaveBeenCalled()
  })

  it("leaves packets with no evidence out", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."], s02: [] })

    expect(await rate(root)).toMatchObject({ status: "submitted", count: 6 })
  })

  it("refuses to mix two models in one run", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await rateFully(root)

    await expect(rateCategory(root, CATEGORY_ID, "model-b")).rejects.toThrow("already holds ratings from model-a")
  })

  it("rejects a packet item that has no source", async () => {
    const root = await writeProject({})
    await writeFile(
      packetFile(root, "s01"),
      JSON.stringify({ items: [{ slot: "acts", tier: "official_act", text: "Voted to hold coverage flat." }] }),
    )

    await expect(rate(root)).rejects.toThrow("s01.json is not valid")
  })

  it("sends a stance joined to the shared wording of its event", async () => {
    const root = await writeProject({})
    await writeEvents(root, [budgetEvent])
    await writeFile(packetFile(root, "s01"), JSON.stringify({ items: [{ event: "event-one", stance: "Voted against" }] }))

    await rate(root)

    expect(sentText()).toContain("- [Official act] Voted against a budget that cut public coverage by 5 percent.")
    expect(sentText()).not.toContain("event-one")
  })

  it("rejects a stance on an event its legislature does not have", async () => {
    const root = await writeProject({})
    await writeFile(packetFile(root, "s01"), JSON.stringify({ items: [{ event: "event-one", stance: "Voted against" }] }))

    await expect(rate(root)).rejects.toThrow('takes a stance on "event-one"')
  })
})

describe("rateStability", () => {
  it("rates a rewording once against every other record and keeps the answers apart from the category's own", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."], s02: ["Voted to widen coverage."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping coverage level."] })
    await rateFully(root)

    const submitted = await rateRewordings(root)
    const collected = await rateRewordings(root)

    expect(submitted).toMatchObject({ status: "submitted", count: 3, remaining: 0 })
    expect(collected).toEqual({ status: "collected", rated: 3, failed: 0, remaining: 0 })
    const saved = await savedRows(root, "stability.jsonl")
    expect(saved.every((row) => [row.first, row.second].includes("s01.a"))).toBe(true)
    expect(saved.some((row) => [row.first, row.second].includes("s01"))).toBe(false)
    expect(await savedRows(root, "comparisons.jsonl")).toHaveLength(12)
    expect(await rateRewordings(root)).toEqual({ status: "complete" })
  })

  it("rates the other order too, in a later batch, for a version that moves more than 6 points", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."], s02: ["Voted to widen coverage."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping coverage level."] })
    collect.mockImplementation(async () => rankedAnswers(lastSubmitted()))
    await rateFully(root)

    await rateRewordings(root)
    const firstOrders = await rateRewordings(root)
    const secondOrders = await rateRewordings(root)

    expect(firstOrders).toEqual({ status: "collected", rated: 3, failed: 0, remaining: 3 })
    expect(secondOrders).toMatchObject({ status: "submitted", count: 3, remaining: 0 })
  })

  it("sends the reworded text, never the original it replaces, and no ids", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping coverage level."] })
    await rateFully(root)

    await rateRewordings(root)

    expect(sentText()).toContain("- [Official act] Cast a vote for keeping coverage level.")
    expect(sentText()).not.toContain("Voted to hold coverage flat.")
    expect(sentText()).not.toContain("s01")
  })

  it("joins a reworded stance to the reworded wording of its event", async () => {
    const root = await writeProject({})
    await writeEvents(root, [budgetEvent])
    await writeFile(packetFile(root, "s01"), JSON.stringify({ items: [{ event: "event-one", stance: "Voted against" }] }))
    await writeRewording(root, { s01: ["Cast a vote against"] }, { "event-one": "a budget lowering public coverage by 5 percent" })
    await rateFully(root)

    await rateRewordings(root)

    expect(sentText()).toContain("- [Official act] Cast a vote against a budget lowering public coverage by 5 percent.")
  })

  it("reports the size of a reworded batch that is still running", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping coverage level."] })
    await rateFully(root)
    await rateRewordings(root)
    collect.mockResolvedValueOnce({ ended: false, processing: 3 })

    const waiting = await rateRewordings(root)

    expect(waiting).toEqual({ status: "waiting", batchId: "batch-1", total: 2, submittedAt: expect.any(String) })
    expect(await savedRows(root, "stability.jsonl")).toEqual([])
  })

  it("refuses to rate rewordings before the category itself is rated", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping coverage level."] })

    await expect(rateRewordings(root)).rejects.toThrow("6 comparisons remain. Run rate first.")
    expect(createBatchRater).not.toHaveBeenCalled()
  })

  it("refuses to rate rewordings with a different model from the category", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping coverage level."] })
    await rateFully(root)

    await expect(rateStability(root, CATEGORY_ID, "model-b")).rejects.toThrow("already holds ratings from model-a")
  })

  it("refuses to rate anything when a rewording names a revealing term", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping Medicare level."] })

    await expect(rate(root)).rejects.toThrow('s01.a mentions "Medicare"')
    await expect(rateRewordings(root)).rejects.toThrow('s01.a mentions "Medicare"')
    expect(createBatchRater).not.toHaveBeenCalled()
  })

  it("rejects a rewording that does not give one text for each item of its record", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping coverage level.", "Said so."] })

    await expect(rateRewordings(root)).rejects.toThrow("gives 2 texts for s01, which has 1 items")
  })

  it("rejects a rewording of a stance when the event has no reworded wording", async () => {
    const root = await writeProject({})
    await writeEvents(root, [budgetEvent])
    await writeFile(packetFile(root, "s01"), JSON.stringify({ items: [{ event: "event-one", stance: "Voted against" }] }))
    await writeRewording(root, { s01: ["Cast a vote against"] })

    await expect(rateRewordings(root)).rejects.toThrow('has no wording for the event "event-one"')
  })

  it("rejects a rewording of a record that has no packet", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writeRewording(root, { s09: ["Cast a vote for keeping coverage level."] })

    await expect(rateRewordings(root)).rejects.toThrow("rewords s09, which has no packet")
  })
})

describe("placeRecords", () => {
  const WIDENING = [
    "Voted to widen coverage.",
    "Voted to widen coverage for farm workers.",
    "Voted to widen coverage for students.",
  ]

  const ratedProject = async (): Promise<string> => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."], s02: WIDENING })
    await writePlacement(root, "s03", ["Cast a vote for keeping coverage level."])
    collect.mockImplementation(async () => rankedAnswers(lastSubmitted()))
    await rateFully(root)
    return root
  }

  const savedPanel = async (root: string): Promise<string[]> =>
    JSON.parse(await readFile(path.join(root, "runs", CATEGORY_ID, "panel.json"), "utf8")).ids

  it("saves a panel of the records not held back and compares the placed record with each, cut to its length, in both orders", async () => {
    const root = await ratedProject()

    const submitted = await place(root)
    const collected = await place(root)

    expect(await savedPanel(root)).toEqual(["anchor-high", "s02", "anchor-low"])
    expect(submitted).toMatchObject({ status: "submitted", count: 6, remaining: 0 })
    expect(collected).toEqual({ status: "collected", rated: 6, failed: 0, remaining: 0 })
    const saved = await savedRows(root, "placements.jsonl")
    expect(saved.map(({ first, second }) => `${first}|${second}`).toSorted()).toEqual([
      "anchor-high|s03",
      "anchor-low|s03",
      "s02~1|s03",
      "s03|anchor-high",
      "s03|anchor-low",
      "s03|s02~1",
    ])
    expect(await savedRows(root, "comparisons.jsonl")).toHaveLength(12)
    expect(await place(root)).toEqual({ status: "complete" })
  })

  it("keeps the saved panel rather than choosing again", async () => {
    const root = await ratedProject()
    await writeFile(
      path.join(root, "runs", CATEGORY_ID, "panel.json"),
      JSON.stringify({ chosenAt: "2026-11-26T00:00:00.000Z", ids: ["anchor-high", "s01"] }),
    )

    expect(await place(root)).toMatchObject({ status: "submitted", count: 4 })
    expect(await savedPanel(root)).toEqual(["anchor-high", "s01"])
  })

  it("sends the placed record's evidence without its id", async () => {
    const root = await ratedProject()

    await place(root)

    expect(sentText()).toContain("- [Official act] Cast a vote for keeping coverage level.")
    expect(sentText()).not.toContain("s03")
    expect(sentText()).not.toContain("s02~1")
  })

  it("refuses to place records before the category itself is rated", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writePlacement(root, "s03", ["Cast a vote for keeping coverage level."])

    await expect(place(root)).rejects.toThrow("before placing records on it: 6 comparisons remain. Run rate first.")
    expect(createBatchRater).not.toHaveBeenCalled()
  })

  it("refuses to place records with a different model from the category", async () => {
    const root = await ratedProject()

    await expect(placeRecords(root, CATEGORY_ID, "model-b")).rejects.toThrow("already holds ratings from model-a")
  })

  it("refuses to place records on a scale whose anchors came out of order", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writePlacement(root, "s03", ["Cast a vote for keeping coverage level."])
    await rateFully(root)
    vi.clearAllMocks()

    await expect(place(root)).rejects.toThrow("anchors of test-category came out of order")
    expect(createBatchRater).not.toHaveBeenCalled()
  })

  it("refuses when there is nothing to place", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await rateFully(root)

    await expect(place(root)).rejects.toThrow("placements/test-category holds no records with evidence to place.")
  })

  it("refuses to rate anything when a placed record names a revealing term", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writePlacement(root, "s03", ["Cast a vote for keeping Medicare level."])

    await expect(rate(root)).rejects.toThrow('s03 mentions "Medicare"')
    await expect(place(root)).rejects.toThrow('s03 mentions "Medicare"')
    expect(createBatchRater).not.toHaveBeenCalled()
  })
})
