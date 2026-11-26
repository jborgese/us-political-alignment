import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createVoteSources, parseSenateIssue, parseSenateMenu, parseSenateVote, toHouseBill } from "../src/voteSources.ts"

const senateVote = `<?xml version="1.0" encoding="UTF-8"?><roll_call_vote>
  <congress>119</congress>
  <session>2</session>
  <congress_year>2026</congress_year>
  <vote_number>279</vote_number>
  <document>
    <document_congress>119</document_congress>
    <document_type>PN</document_type>
    <document_number>1272-10</document_number>
    <document_name>PN1272-10</document_name>
  </document>
  <members>
    <member>
      <member_full>Alsobrooks (D-MD)</member_full>
      <last_name>Alsobrooks</last_name>
      <first_name>Angela</first_name>
      <party>D</party>
      <state>MD</state>
      <vote_cast>Nay</vote_cast>
      <lis_member_id>S428</lis_member_id>
    </member>
    <member>
      <member_full>Luj&#225;n (D-NM)</member_full>
      <last_name>Luj&#225;n</last_name>
      <first_name>Ben Ray</first_name>
      <party>D</party>
      <state>NM</state>
      <vote_cast>Not Voting</vote_cast>
      <lis_member_id>S407</lis_member_id>
    </member>
  </members>
</roll_call_vote>`

const senateMenu = `<?xml version="1.0" encoding="UTF-8"?><vote_summary>
  <congress>119</congress>
  <session>2</session>
  <congress_year>2026</congress_year>
  <votes>
    <vote>
      <vote_number>00279</vote_number>
      <vote_date>20-Nov</vote_date>
      <issue>PN1272-10</issue>
      <question>On the Cloture Motion
         </question>
      <result>Agreed to</result>
      <title>Motion to Invoke Cloture: Jesus A. Osete to be U.S. District Judge</title>
    </vote>
    <vote>
      <vote_number>00007</vote_number>
      <vote_date>08-Jan</vote_date>
      <issue>H.R. 1834</issue>
      <question>On Passage of the Bill</question>
      <result>Passed</result>
      <title>A bill to advance policy priorities &amp; break the gridlock</title>
    </vote>
  </votes>
</vote_summary>`

describe("parseSenateVote", () => {
  it("reads each senator's LIS ID, name, and vote, decoding entities", () => {
    expect(parseSenateVote(senateVote, { congress: 119, session: 2, number: 279 })).toEqual({
      chamber: "us-senate",
      congress: 119,
      session: 2,
      number: 279,
      measure: "PN1272-10",
      members: [
        { id: "S428", firstName: "Angela", lastName: "Alsobrooks", vote: "Nay" },
        { id: "S407", firstName: "Ben Ray", lastName: "Luján", vote: "Not Voting" },
      ],
    })
  })
})

describe("parseSenateMenu", () => {
  it("dates each vote, links its page, and reads bills but not nominations", () => {
    expect(parseSenateMenu(senateMenu, 119, 2)).toEqual([
      {
        chamber: "us-senate",
        congress: 119,
        session: 2,
        number: 279,
        date: "2026-11-20",
        question: "On the Cloture Motion Motion to Invoke Cloture: Jesus A. Osete to be U.S. District Judge",
        result: "Agreed to",
        url: "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00279.htm",
        bill: null,
      },
      {
        chamber: "us-senate",
        congress: 119,
        session: 2,
        number: 7,
        date: "2026-01-08",
        question: "On Passage of the Bill A bill to advance policy priorities & break the gridlock",
        result: "Passed",
        url: "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00007.htm",
        bill: { congress: 119, type: "hr", number: "1834" },
      },
    ])
  })
})

describe("bill references", () => {
  it("reads bills and joint resolutions from either chamber and nothing else", () => {
    expect([
      parseSenateIssue("S. 2", 119),
      parseSenateIssue("S.J.Res. 18", 119),
      parseSenateIssue("H.J.Res. 35", 119),
      parseSenateIssue("S.Res. 5", 119),
      toHouseBill(119, "HJRES", "88"),
      toHouseBill(119, "HRES", "1075"),
      toHouseBill(119, "HAMDT", "5"),
    ]).toEqual([
      { congress: 119, type: "s", number: "2" },
      { congress: 119, type: "sjres", number: "18" },
      { congress: 119, type: "hjres", number: "35" },
      null,
      { congress: 119, type: "hjres", number: "88" },
      null,
      null,
    ])
  })
})

describe("createVoteSources", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv("CONGRESS_API_KEY", "secret-key")
    vi.spyOn(console, "error").mockImplementation(() => {})
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("refuses to start without a Congress.gov key", () => {
    vi.stubEnv("CONGRESS_API_KEY", "")
    expect(() => createVoteSources()).toThrow("Set CONGRESS_API_KEY")
  })

  it("sends the key as a header, never in the URL, and follows member pages", async () => {
    const results = (count: number, offset: number) =>
      Array.from({ length: count }, (_, index) => ({
        bioguideID: `M${String(offset + index).padStart(6, "0")}`,
        firstName: "First",
        lastName: "Last",
        voteCast: "Yea",
      }))
    fetchMock
      .mockResolvedValueOnce(Response.json({ houseRollCallVoteMemberVotes: { legislationType: "HR", legislationNumber: "1", results: results(250, 0) } }))
      .mockResolvedValueOnce(Response.json({ houseRollCallVoteMemberVotes: { results: results(182, 250) } }))
    const rollCall = await createVoteSources().rollCall("us-house", { congress: 119, session: 1, number: 190 })
    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      key: (init?.headers as Record<string, string>)["X-Api-Key"],
    }))
    expect(calls).toEqual([
      { url: "https://api.congress.gov/v3/house-vote/119/1/190/members?limit=250&offset=0&format=json", key: "secret-key" },
      { url: "https://api.congress.gov/v3/house-vote/119/1/190/members?limit=250&offset=250&format=json", key: "secret-key" },
    ])
    expect(rollCall).toMatchObject({ chamber: "us-house", measure: "HR 1" })
    expect(rollCall?.members).toHaveLength(432)
  })

  it("gives up on a request that takes longer than a minute and says which one", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
    await expect(createVoteSources().rollCall("us-house", { congress: 119, session: 1, number: 190 })).rejects.toThrow(
      new Error("api.congress.gov did not answer within 60 seconds for /v3/house-vote/119/1/190/members"),
    )
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it("returns null for a roll call that does not exist and names only the path when a source fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })).mockResolvedValueOnce(new Response("", { status: 503 }))
    const sources = createVoteSources()
    await expect(sources.rollCall("us-house", { congress: 120, session: 1, number: 9 })).resolves.toBeNull()
    await expect(sources.bill({ congress: 120, type: "hr", number: "1" })).rejects.toThrow(
      new Error("Congress.gov answered 503 for /bill/120/hr/1"),
    )
  })
})
