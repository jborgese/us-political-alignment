import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { rateCategory, rateStability } from "../src/rate.ts"
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
  subjects: ["s01", "s02"].map((id) => ({
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

    expect(waiting).toEqual({ status: "waiting", batchId: "batch-1", finished: 2, total: 6 })
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
  it("rates a rewording against every other record and keeps the answers apart from the category's own", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."], s02: ["Voted to widen coverage."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping coverage level."] })
    await rateFully(root)

    const submitted = await rateRewordings(root)
    const collected = await rateRewordings(root)

    expect(submitted).toMatchObject({ status: "submitted", count: 6, remaining: 0 })
    expect(collected).toEqual({ status: "collected", rated: 6, failed: 0, remaining: 0 })
    const saved = await savedRows(root, "stability.jsonl")
    expect(saved.every((row) => [row.first, row.second].includes("s01.a"))).toBe(true)
    expect(saved.some((row) => [row.first, row.second].includes("s01"))).toBe(false)
    expect(await savedRows(root, "comparisons.jsonl")).toHaveLength(12)
    expect(await rateRewordings(root)).toEqual({ status: "complete" })
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

  it("reports how many reworded comparisons have finished while the batch is still running", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await writeRewording(root, { s01: ["Cast a vote for keeping coverage level."] })
    await rateFully(root)
    await rateRewordings(root)
    collect.mockResolvedValueOnce({ ended: false, processing: 3 })

    const waiting = await rateRewordings(root)

    expect(waiting).toEqual({ status: "waiting", batchId: "batch-1", finished: 1, total: 4 })
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
