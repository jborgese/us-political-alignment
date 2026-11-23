import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { rateCategory } from "../src/rate.ts"
import { createRater } from "../src/rater.ts"

vi.mock("../src/rater.ts", () => ({ createRater: vi.fn() }))

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

const savedComparisons = async (root: string): Promise<{ first: string; second: string; winner: string }[]> => {
  const text = await readFile(path.join(root, "runs", CATEGORY_ID, "comparisons.jsonl"), "utf8")
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
}

const rater = vi.fn(async () => ({ choice: "A" as const, reason: "The first record did more." }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.mocked(createRater).mockReturnValue(rater)
})

describe("rateCategory", () => {
  it("rates every ordered pair once and saves each result", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })

    const summary = await rateCategory(root, CATEGORY_ID, "model-a")

    expect(summary).toEqual({ rated: 6, alreadyRated: 0 })
    expect(rater).toHaveBeenCalledTimes(6)
    const saved = await savedComparisons(root)
    expect(saved).toHaveLength(6)
    expect(saved.every((row) => row.winner === row.first)).toBe(true)
  })

  it("sends the rater evidence text without ids or sources", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })

    await rateCategory(root, CATEGORY_ID, "model-a")

    const sent = rater.mock.calls.flat().join("\n")
    expect(sent).toContain("Voted to hold coverage flat.")
    expect(sent).not.toContain("s01")
    expect(sent).not.toContain("anchor-high")
    expect(sent).not.toContain("example.org")
  })

  it("picks up where an earlier run stopped", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await rateCategory(root, CATEGORY_ID, "model-a")
    rater.mockClear()

    const summary = await rateCategory(root, CATEGORY_ID, "model-a")

    expect(summary).toEqual({ rated: 0, alreadyRated: 6 })
    expect(rater).not.toHaveBeenCalled()
  })

  it("refuses to rate when a packet names a revealing term", async () => {
    const root = await writeProject({ s01: ["Voted to expand Medicare."] })

    await expect(rateCategory(root, CATEGORY_ID, "model-a")).rejects.toThrow('s01 mentions "Medicare"')
    expect(createRater).not.toHaveBeenCalled()
  })

  it("leaves packets with no evidence out", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."], s02: [] })

    const summary = await rateCategory(root, CATEGORY_ID, "model-a")

    expect(summary.rated).toBe(6)
  })

  it("refuses to mix two models in one run", async () => {
    const root = await writeProject({ s01: ["Voted to hold coverage flat."] })
    await rateCategory(root, CATEGORY_ID, "model-a")

    await expect(rateCategory(root, CATEGORY_ID, "model-b")).rejects.toThrow("already holds ratings from model-a")
  })

  it("rejects a packet item that has no source", async () => {
    const root = await writeProject({})
    await writeFile(
      packetFile(root, "s01"),
      JSON.stringify({ items: [{ slot: "acts", tier: "official_act", text: "Voted to hold coverage flat." }] }),
    )

    await expect(rateCategory(root, CATEGORY_ID, "model-a")).rejects.toThrow("s01.json is not valid")
  })

  it("sends a stance joined to the shared wording of its event", async () => {
    const root = await writeProject({})
    await writeEvents(root, [budgetEvent])
    await writeFile(packetFile(root, "s01"), JSON.stringify({ items: [{ event: "event-one", stance: "Voted against" }] }))

    await rateCategory(root, CATEGORY_ID, "model-a")

    const sent = rater.mock.calls.flat().join("\n")
    expect(sent).toContain("- [Official act] Voted against a budget that cut public coverage by 5 percent.")
    expect(sent).not.toContain("event-one")
  })

  it("rejects a stance on an event its legislature does not have", async () => {
    const root = await writeProject({})
    await writeFile(packetFile(root, "s01"), JSON.stringify({ items: [{ event: "event-one", stance: "Voted against" }] }))

    await expect(rateCategory(root, CATEGORY_ID, "model-a")).rejects.toThrow('takes a stance on "event-one"')
  })
})
