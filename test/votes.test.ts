import { describe, expect, it } from "vitest"

import type { Key } from "../src/files.ts"
import {
  congressOn,
  hasFileChanges,
  isPassageVote,
  issueBody,
  matchRollCallIds,
  prBody,
  provisionalEnds,
  sortCandidates,
  updateKeyContent,
  updateRecord,
  type Candidate,
  type ListenerSummary,
  type VoteEvent,
} from "../src/votes.ts"

type Subject = Key["subjects"][number]

const member = (id: string, name: string, extra: Partial<Subject> = {}): Subject => ({
  id,
  name,
  kind: "member",
  group: "Sample Caucus",
  legislature: "us-house",
  aliases: [],
  ...extra,
})

const keeps = { slot: "keeps", tier: "official_act", text: "Votes to keep the system.", sources: ["https://example.org"] }
const seeks = { slot: "seeks", tier: "official_act", text: "Introduced a bill.", sources: ["https://example.org"] }

const events: VoteEvent[] = [
  { id: "budget", slot: "changes", rollCall: { congress: 119, session: 1, number: 190 } },
  { id: "subsidy", slot: "changes", rollCall: { congress: 119, session: 2, number: 11 } },
]

describe("congressOn", () => {
  it("names the Congress and session in progress, which turn over on 3 January", () => {
    expect([
      congressOn(new Date("2026-11-26T12:00:00Z")),
      congressOn(new Date("2027-01-02T12:00:00Z")),
      congressOn(new Date("2027-01-03T12:00:00Z")),
      congressOn(new Date("2028-02-01T12:00:00Z")),
    ]).toEqual([
      { congress: 119, session: 2 },
      { congress: 119, session: 2 },
      { congress: 120, session: 1 },
      { congress: 120, session: 2 },
    ])
  })
})

describe("updateRecord", () => {
  it("adds stances after the last stance and clears the event from noPosition and its slot from emptySlots", () => {
    const content = {
      items: [keeps, { event: "other", stance: "Voted for" }, seeks],
      emptySlots: ["changes"],
      noPosition: ["budget"],
    }
    const update = updateRecord(content, events, { budget: "Aye", subsidy: "Nay" }, 12)
    expect(update).toEqual({
      content: {
        items: [
          keeps,
          { event: "other", stance: "Voted for" },
          { event: "budget", stance: "Voted for" },
          { event: "subsidy", stance: "Voted against" },
          seeks,
        ],
      },
      added: [
        { event: "budget", stance: "Voted for" },
        { event: "subsidy", stance: "Voted against" },
      ],
      listedNoPosition: [],
      disagreements: [],
      statementsWithVotes: [],
      full: [],
    })
  })

  it("lists an event under noPosition when the member was present, did not vote, or was not in the chamber", () => {
    const update = updateRecord({ items: [keeps], noPosition: ["subsidy"] }, events, { budget: null, subsidy: "Not Voting" }, 12)
    expect(update.content).toEqual({ items: [keeps], noPosition: ["subsidy", "budget"] })
    expect(update.listedNoPosition).toEqual(["budget"])
  })

  it("reports a plain stance the roll call contradicts and leaves every existing stance alone", () => {
    const content = {
      items: [
        { event: "budget", stance: "Voted for" },
        { event: "subsidy", stance: "Abstained on the first passage, then voted for the final version, of" },
      ],
    }
    const update = updateRecord(content, events, { budget: "No", subsidy: "Nay" }, 12)
    expect(update.content).toBe(content)
    expect(update.disagreements).toEqual([{ event: "budget", stance: "Voted for", vote: "No" }])
  })

  it("flags a stated position once the member has a recorded vote on the event, without changing it", () => {
    const content = { items: [{ event: "budget", stance: "Pledged to vote against", tier: "statement" }] }
    const update = updateRecord(content, events, { budget: "Yea", subsidy: "Not Voting" }, 12)
    expect(update).toMatchObject({ content: { ...content, noPosition: ["subsidy"] }, statementsWithVotes: [{ event: "budget", vote: "Yea" }] })
  })

  it("skips events whose roll call was not found and does not add an item past the limit", () => {
    const update = updateRecord({ items: [keeps, seeks] }, events, { subsidy: "Yea" }, 2)
    expect(update).toMatchObject({ content: { items: [keeps, seeks] }, added: [], full: ["subsidy"] })
  })
})

describe("matchRollCallIds", () => {
  it("fills an ID only from a unique exact name match that no other subject holds", () => {
    const subjects = [
      member("s01", "Claire Valdez"),
      member("s02", "Darializa Ávila Chevalier"),
      member("s03", "Sam Lee"),
      member("s04", "Ann Held", { rollCallId: "H000001" }),
      member("s05", "Rita Senator", { legislature: "us-senate" }),
      member("s06", "Pat Abroad", { legislature: "uk-commons" }),
    ]
    const latest = {
      "us-house": [
        { id: "V000001", firstName: "Claire", lastName: "Valdez", vote: "Yea" },
        { id: "A000002", firstName: "Darializa", lastName: "Avila Chevalier", vote: "Nay" },
        { id: "L000003", firstName: "Sam", lastName: "Lee", vote: "Yea" },
        { id: "L000004", firstName: "Sam", lastName: "Lee", vote: "Nay" },
        { id: "H000001", firstName: "Ann", lastName: "Held", vote: "Yea" },
      ],
      "us-senate": [{ id: "S500", firstName: "Rita", lastName: "Senator", vote: "Yea" }],
    }
    expect(matchRollCallIds(subjects, latest)).toEqual({
      matched: [
        { subjectId: "s01", rollCallId: "V000001", matchedName: "Claire Valdez" },
        { subjectId: "s02", rollCallId: "A000002", matchedName: "Darializa Avila Chevalier" },
        { subjectId: "s05", rollCallId: "S500", matchedName: "Rita Senator" },
      ],
      unmatched: ["s03"],
    })
  })
})

describe("provisionalEnds", () => {
  it("ends provisional status once the second session of the member's first Congress has a roll call", () => {
    const subjects = [
      member("s01", "A", { provisional: true, firstCongress: 120 }),
      member("s02", "B", { provisional: true, firstCongress: 120, legislature: "us-senate" }),
      member("s03", "C", { provisional: true }),
      member("s04", "D", { firstCongress: 120 }),
    ]
    expect(provisionalEnds(subjects, { "us-house:120": 3, "us-senate:120": 0 })).toEqual({
      ended: ["s01"],
      withoutFirstCongress: ["s03"],
    })
  })
})

describe("updateKeyContent", () => {
  it("adds matched IDs and drops the provisional flag but keeps firstCongress", () => {
    const content = {
      revealingTerms: [],
      subjects: [
        { id: "s01", name: "A", provisional: true, firstCongress: 120 },
        { id: "s02", name: "B" },
      ],
    }
    expect(updateKeyContent(content, [{ subjectId: "s02", rollCallId: "B000002", matchedName: "B" }], ["s01"])).toEqual({
      revealingTerms: [],
      subjects: [
        { id: "s01", name: "A", firstCongress: 120 },
        { id: "s02", name: "B", rollCallId: "B000002" },
      ],
    })
  })
})

describe("isPassageVote", () => {
  it("keeps passage, concurrence, conference, and override votes in either chamber and drops procedural ones", () => {
    const questions = {
      "On Passage": true,
      "On Motion to Suspend the Rules and Pass, as Amended": true,
      "On Motion to Concur in the Senate Amendment": true,
      "On Agreeing to the Conference Report": true,
      "On Overriding the Veto": true,
      "On Passage of the Bill Bill Passed: H.R. 4": true,
      "On the Joint Resolution S.J.Res. 18": true,
      "On Motion to Recommit": false,
      "On the Cloture Motion Motion to Invoke Cloture on the Motion to Concur": false,
      "On the Motion to Proceed Motion to Proceed to H.R. 1": false,
      "On Ordering the Previous Question": false,
    }
    expect(Object.fromEntries(Object.keys(questions).map((question) => [question, isPassageVote(question)]))).toEqual(questions)
  })
})

const candidate = (number: number, policyArea: string | null, extra: Partial<Candidate> = {}): Candidate => ({
  chamber: "us-house",
  congress: 120,
  session: 1,
  number,
  date: `2027-02-${String(number).padStart(2, "0")}`,
  question: "On Passage",
  result: "Passed",
  url: `https://clerk.house.gov/Votes/2027${number}`,
  bill: { congress: 120, type: "hr", number: String(number) },
  title: `Bill ${number}`,
  policyArea,
  ...extra,
})

describe("sortCandidates", () => {
  it("lists each new passage vote under its one issue, once under several issues when its policy area has more, and the rest as other", () => {
    const candidates = [
      candidate(1, "Health"),
      candidate(2, "Economics and Public Finance"),
      candidate(3, "Congress"),
      candidate(4, null),
      candidate(5, "Health", { question: "On Motion to Recommit" }),
      candidate(6, "Health", { bill: null }),
      candidate(7, "Health"),
    ]
    const policyAreas = { "welfare-health": ["Health", "Economics and Public Finance"], economics: ["Economics and Public Finance"] }
    const sorted = sortCandidates(candidates, policyAreas, ["us-house:120-1-7"])
    expect({
      welfare: sorted.byCategory["welfare-health"].map(({ number }) => number),
      economics: sorted.byCategory.economics.map(({ number }) => number),
      shared: sorted.shared.map(({ candidate, categoryIds }) => ({ number: candidate.number, categoryIds })),
      other: sorted.other.map(({ number }) => number),
    }).toEqual({
      welfare: [1],
      economics: [],
      shared: [{ number: 2, categoryIds: ["welfare-health", "economics"] }],
      other: [4, 3],
    })
  })
})

const emptySummary: ListenerSummary = {
  changes: [],
  idMatches: [],
  withoutId: [],
  provisionalEnded: [],
  withoutFirstCongress: [],
  reRating: null,
}

describe("prBody and issueBody", () => {
  it("has no file changes when only notices are new", () => {
    const summary: ListenerSummary = { ...emptySummary, withoutId: [member("s01", "Claire Valdez")] }
    expect(hasFileChanges(summary)).toBe(false)
  })

  it("lists each added stance with its roll call and the comparisons to re-rate", () => {
    const summary: ListenerSummary = {
      ...emptySummary,
      changes: [
        {
          categoryId: "welfare-health",
          subject: member("s07", "Pramila Jayapal"),
          update: { content: { items: [] }, added: [{ event: "subsidy", stance: "Voted for" }], listedNoPosition: [], disagreements: [], statementsWithVotes: [], full: [] },
        },
      ],
      reRating: [{ categoryId: "welfare-health", scale: 50, placement: 20, problems: [] }],
    }
    const body = prBody(summary, { "welfare-health/subsidy": "House 119-2 roll 11, HR 1834" })
    expect(body).toContain("- welfare-health: Pramila Jayapal (s07), Voted for `subsidy` (House 119-2 roll 11, HR 1834)")
    expect(body).toContain("- **welfare-health**: `npm run rate -- welfare-health` (50 comparisons), then `npm run place -- welfare-health` (20 comparisons)")
    expect(body).toContain("- [x] Evidence")
  })

  it("puts notices first and says so when an issue has no new votes", () => {
    const body = issueBody(
      { byCategory: { "welfare-health": [candidate(1, "Health")], economics: [] }, shared: [], other: [] },
      { "welfare-health": "Welfare and health", economics: "Economics" },
      ["#### Members with no roll call ID", ""],
      "2027-02-15",
    )
    expect(body.startsWith("#### Members with no roll call ID")).toBe(true)
    expect(body).toContain(
      "### Welfare and health\n\n- [House 120-1 roll 1](https://clerk.house.gov/Votes/20271), 1 Feb 2027: H.R. 1, On Passage (Passed). *Bill 1* Policy area: Health",
    )
    expect(body).toContain("### Economics\n\nNone.")
    expect(body).not.toContain("### Several issues")
  })

  it("lists a vote shared by several issues once, naming the issues", () => {
    const body = issueBody(
      {
        byCategory: { "welfare-health": [], economics: [] },
        shared: [{ candidate: candidate(2, "Economics and Public Finance"), categoryIds: ["welfare-health", "economics"] }],
        other: [],
      },
      { "welfare-health": "Welfare and health", economics: "Economics" },
      [],
      "2027-02-15",
    )
    expect(body).toContain(
      "### Several issues\n\n- [House 120-1 roll 2](https://clerk.house.gov/Votes/20272), 2 Feb 2027: H.R. 2, On Passage (Passed). *Bill 2* Policy area: Economics and Public Finance. Issues: Welfare and health, Economics",
    )
    expect(body).toContain("### Welfare and health\n\nNone.")
  })
})
