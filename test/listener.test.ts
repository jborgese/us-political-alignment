import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest"

import { listenForVotes } from "../src/listener.ts"
import { createVoteSources, type VoteSources } from "../src/voteSources.ts"

vi.mock("../src/voteSources.ts", () => ({ createVoteSources: vi.fn() }))

const CATEGORY_ID = "welfare-health"
const source = "https://example.org/record"
const keeps = { slot: "keeps", tier: "official_act", text: "Votes to keep the present system.", sources: [source] }

const category = {
  title: "Welfare and health",
  question: "Which record shows more support for public coverage?",
  highPole: "More support",
  lowPole: "Less support",
  slots: [
    { id: "keeps", heading: "What it keeps" },
    { id: "changes", heading: "What it changes" },
  ],
  anchors: [
    { id: "anchor-high", items: [{ slot: "keeps", tier: "official_act", text: "Voted to expand public coverage." }] },
    { id: "anchor-low", items: [{ slot: "keeps", tier: "official_act", text: "Voted to cut public coverage." }] },
  ],
}

const events = {
  legislatures: [
    {
      id: "us-house",
      events: [
        {
          id: "budget",
          slot: "changes",
          text: "a budget law that cut public coverage by 5 percent",
          sources: [source],
          rollCall: { congress: 120, session: 1, number: 5 },
        },
      ],
    },
    {
      id: "us-senate",
      events: [
        {
          id: "senate-budget",
          slot: "changes",
          text: "the same budget law",
          sources: [source],
          rollCall: { congress: 120, session: 1, number: 7 },
        },
      ],
    },
  ],
}

const key = {
  revealingTerms: ["Medicare"],
  subjects: [
    { id: "s01", name: "Pat Sitting", kind: "member", group: "Sample", legislature: "us-house", aliases: [], rollCallId: "H000001" },
    { id: "s02", name: "Claire Valdez", kind: "member", group: "Members-elect", legislature: "us-house", aliases: [], provisional: true, firstCongress: 120 },
    { id: "s03", name: "Rita Senator", kind: "member", group: "Sample", legislature: "us-senate", aliases: [], rollCallId: "S500" },
    { id: "s04", name: "Sample Caucus", kind: "caucus", group: "Sample", legislature: "us-house", aliases: [] },
  ],
}

const records = {
  "packets/s01.json": { items: [keeps] },
  "placements/s02.json": { items: [keeps] },
  "packets/s03.json": { items: [keeps], emptySlots: ["changes"] },
  "packets/s04.json": { items: [keeps, { event: "budget", stance: "All of its members voted against" }] },
}

const writeProject = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "vote-listener-"))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await Promise.all(["categories", "events", "site", `packets/${CATEGORY_ID}`, `placements/${CATEGORY_ID}`].map((dir) => mkdir(path.join(root, dir), { recursive: true })))
  const files: Record<string, unknown> = {
    [`categories/${CATEGORY_ID}.json`]: category,
    [`events/${CATEGORY_ID}.json`]: events,
    "key.json": key,
    "votes.json": { policyAreas: { [CATEGORY_ID]: ["Health"] } },
    "site/categories.json": [{ id: CATEGORY_ID, label: "Welfare and health", published: false }],
    ...Object.fromEntries(Object.entries(records).map(([file, content]) => [file.replace("/", `/${CATEGORY_ID}/`), content])),
  }
  await Promise.all(
    Object.entries(files).map(([file, content]) => writeFile(path.join(root, file), `${JSON.stringify(content, null, 2)}\n`)),
  )
  return root
}

const readRecord = async (root: string, file: string): Promise<unknown> =>
  JSON.parse(await readFile(path.join(root, file.replace("/", `/${CATEGORY_ID}/`)), "utf8"))

const fakeSources: VoteSources = {
  latestRollCall: async (chamber) =>
    chamber === "us-house"
      ? { chamber, congress: 120, session: 2, number: 3, measure: "HR 9", members: [{ id: "V000001", firstName: "Claire", lastName: "Valdez", vote: "Yea" }] }
      : null,
  voteCount: async (chamber, congress, session) => (chamber === "us-house" && congress === 120 && session === 2 ? 3 : 0),
  rollCall: async (chamber, ref) =>
    chamber === "us-house"
      ? {
          chamber,
          ...ref,
          measure: "HR 1",
          members: [
            { id: "H000001", firstName: "Pat", lastName: "Sitting", vote: "Yea" },
            { id: "V000001", firstName: "Claire", lastName: "Valdez", vote: "Nay" },
          ],
        }
      : { chamber, ...ref, measure: "H.R. 1", members: [{ id: "S500", firstName: "Rita", lastName: "Senator", vote: "Not Voting" }] },
  votesSince: async (chamber, congress, session) =>
    chamber === "us-house" && session === 2
      ? [
          {
            chamber,
            congress,
            session,
            number: 12,
            date: "2028-01-08",
            question: "On Passage",
            result: "Passed",
            url: "https://clerk.house.gov/Votes/202812",
            bill: { congress, type: "hr", number: "9" },
          },
        ]
      : [],
  bill: async () => ({ title: "Care Act", policyArea: "Health" }),
}

const now = new Date("2028-01-10T12:00:00Z")

describe("listenForVotes", () => {
  beforeEach(() => {
    vi.mocked(createVoteSources).mockReset().mockReturnValue(fakeSources)
  })

  it("fills House and Senate members from their roll calls, resolves a member-elect, and ends provisional status", async () => {
    const root = await writeProject()
    const outcome = await listenForVotes(root, true, now)
    expect({
      s01: await readRecord(root, "packets/s01.json"),
      s02: await readRecord(root, "placements/s02.json"),
      s03: await readRecord(root, "packets/s03.json"),
      s04: await readRecord(root, "packets/s04.json"),
      memberElect: JSON.parse(await readFile(path.join(root, "key.json"), "utf8")).subjects[1],
    }).toEqual({
      s01: { items: [keeps, { event: "budget", stance: "Voted for" }] },
      s02: { items: [keeps, { event: "budget", stance: "Voted against" }] },
      s03: { items: [keeps], emptySlots: ["changes"], noPosition: ["senate-budget"] },
      s04: records["packets/s04.json"],
      memberElect: { ...key.subjects[1], provisional: undefined, rollCallId: "V000001" },
    })
    expect(outcome.changedFiles.map((file) => path.relative(root, file)).toSorted()).toEqual([
      "key.json",
      `packets/${CATEGORY_ID}/s01.json`,
      `packets/${CATEGORY_ID}/s03.json`,
      `placements/${CATEGORY_ID}/s02.json`,
    ])
    expect(outcome.pr).toContain("- welfare-health: Pat Sitting (s01), Voted for `budget` (House 120-1 roll 5, HR 1)")
    expect(outcome.pr).toContain("- Claire Valdez (s02): V000001, listed as Claire Valdez")
    expect(outcome.pr).toContain("#### Provisional status ended: the second session of their first Congress has begun\n\n- Claire Valdez (s02)")
    expect(outcome.pr).toContain("`npm run rate -- welfare-health`")
    expect(outcome.issue).toContain("### Welfare and health\n\n- [House 120-2 roll 12](https://clerk.house.gov/Votes/202812), 8 Jan 2028: H.R. 9")
  })

  it("changes nothing on disk in preview", async () => {
    const root = await writeProject()
    const outcome = await listenForVotes(root, false, now)
    expect(await readRecord(root, "packets/s01.json")).toEqual(records["packets/s01.json"])
    expect(JSON.parse(await readFile(path.join(root, "key.json"), "utf8"))).toEqual(key)
    expect(outcome.changedFiles).toHaveLength(4)
    expect(outcome.pr).toContain("Run `npm run votes -- write` to count the comparisons to re-rate.")
  })

  it("reports a roll call that cannot be found instead of guessing", async () => {
    vi.mocked(createVoteSources).mockReturnValue({ ...fakeSources, rollCall: async () => null })
    const root = await writeProject()
    const outcome = await listenForVotes(root, false, now)
    expect(outcome.issue).toContain("#### Roll calls not found\n\n- House 120-1 roll 5")
    expect(outcome.issue).toContain("- Senate 120-1 roll 7")
  })
})
