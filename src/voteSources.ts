import process from "node:process"

import { z } from "zod"

import type { BillRef, Chamber, ListedVote, MemberVote, RollCall, RollCallRef } from "./votes.ts"

const CONGRESS_API = "https://api.congress.gov/v3"
const SENATE_LIS = "https://www.senate.gov/legislative/LIS"
const USER_AGENT = "us-political-alignment vote listener (https://github.com/jborgese/us-political-alignment)"
const PAGE_SIZE = 250
const REQUEST_TIMEOUT_SECONDS = 60
const MOST_RESULTS = 2000
const HOUSE_BILL_TYPES = ["HR", "S", "HJRES", "SJRES"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export interface Bill {
  title: string
  policyArea: string | null
}

export interface VoteSources {
  rollCall: (chamber: Chamber, ref: RollCallRef) => Promise<RollCall | null>
  latestRollCall: (chamber: Chamber, congress: number) => Promise<RollCall | null>
  voteCount: (chamber: Chamber, congress: number, session: number) => Promise<number>
  votesSince: (chamber: Chamber, congress: number, session: number, since: string) => Promise<ListedVote[]>
  bill: (bill: BillRef) => Promise<Bill | null>
}

const houseListSchema = z.object({
  houseRollCallVotes: z
    .array(
      z.object({
        congress: z.number(),
        sessionNumber: z.number(),
        rollCallNumber: z.number(),
        startDate: z.string(),
        legislationType: z.string().optional(),
        legislationNumber: z.string().optional(),
        result: z.string().optional(),
      }),
    )
    .default([]),
  pagination: z.object({ count: z.number().optional() }).optional(),
})

const houseItemSchema = z.object({ houseRollCallVote: z.object({ voteQuestion: z.string().default("") }) })

const houseMembersSchema = z.object({
  houseRollCallVoteMemberVotes: z.object({
    legislationType: z.string().optional(),
    legislationNumber: z.string().optional(),
    results: z
      .array(z.object({ bioguideID: z.string(), firstName: z.string(), lastName: z.string(), voteCast: z.string() }))
      .default([]),
  }),
})

const billSchema = z.object({
  bill: z.object({ title: z.string().default(""), policyArea: z.object({ name: z.string() }).nullish() }),
})

const congressApiKey = (): string => {
  const key = process.env.CONGRESS_API_KEY
  if (!key) throw new Error("Set CONGRESS_API_KEY to a Congress.gov API key. See .env.example.")
  return key
}

const fetchWithLimit = async (url: URL, headers: Record<string, string> = {}): Promise<Response> => {
  const offset = url.searchParams.get("offset")
  console.error(`Fetching ${url.host}${url.pathname}${offset && offset !== "0" ? ` from result ${offset}` : ""}`)
  try {
    return await fetch(url, {
      headers: { ...headers, "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_SECONDS * 1000),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`${url.host} did not answer within ${REQUEST_TIMEOUT_SECONDS} seconds for ${url.pathname}`)
    }
    throw error
  }
}

const getCongress = async <Schema extends z.ZodType>(
  key: string,
  route: string,
  query: Record<string, string>,
  schema: Schema,
): Promise<z.infer<Schema> | null> => {
  const url = new URL(`${CONGRESS_API}${route}`)
  Object.entries({ ...query, format: "json" }).forEach(([name, value]) => url.searchParams.set(name, value))
  const response = await fetchWithLimit(url, { "X-Api-Key": key })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Congress.gov answered ${response.status} for ${route}`)
  const result = schema.safeParse(await response.json())
  if (!result.success) throw new Error(`Congress.gov sent an unexpected shape for ${route}:\n${z.prettifyError(result.error)}`)
  return result.data
}

const getText = async (url: string): Promise<string | null> => {
  const response = await fetchWithLimit(new URL(url))
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${new URL(url).host} answered ${response.status} for ${new URL(url).pathname}`)
  return response.text()
}

const decodeXml = (text: string): string =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")

const xmlBlocks = (xml: string, tag: string): string[] =>
  [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((match) => match[1])

const xmlField = (xml: string, tag: string): string =>
  decodeXml(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "").trim()

const senatePath = (ref: RollCallRef, extension: "xml" | "htm"): string =>
  `${SENATE_LIS}/roll_call_votes/vote${ref.congress}${ref.session}/vote_${ref.congress}_${ref.session}_${String(ref.number).padStart(5, "0")}.${extension}`

const senateMenuUrl = (congress: number, session: number): string =>
  `${SENATE_LIS}/roll_call_lists/vote_menu_${congress}_${session}.xml`

export const parseSenateVote = (xml: string, ref: RollCallRef): RollCall => ({
  chamber: "us-senate",
  ...ref,
  measure: xmlField(xml, "document_name"),
  members: xmlBlocks(xml, "member").map(
    (member): MemberVote => ({
      id: xmlField(member, "lis_member_id"),
      firstName: xmlField(member, "first_name"),
      lastName: xmlField(member, "last_name"),
      vote: xmlField(member, "vote_cast"),
    }),
  ),
})

const SENATE_BILL = /^(H\.\s*R\.|S\.|H\.\s*J\.\s*Res\.|S\.\s*J\.\s*Res\.)\s*(\d+)$/i

export const parseSenateIssue = (issue: string, congress: number): BillRef | null => {
  const match = issue.trim().match(SENATE_BILL)
  if (!match) return null
  const type = match[1].replace(/[\s.]/g, "").toLowerCase()
  return { congress, type, number: match[2] }
}

const senateDate = (dayMonth: string, year: string): string => {
  const [day, month] = dayMonth.split("-")
  const monthNumber = MONTHS.indexOf(month) + 1
  return `${year}-${String(monthNumber).padStart(2, "0")}-${day.padStart(2, "0")}`
}

export const parseSenateMenu = (xml: string, congress: number, session: number): ListedVote[] => {
  const year = xmlField(xml, "congress_year")
  return xmlBlocks(xml, "vote").map((vote): ListedVote => {
    const ref = { congress, session, number: Number(xmlField(vote, "vote_number")) }
    return {
      chamber: "us-senate",
      ...ref,
      date: senateDate(xmlField(vote, "vote_date"), year),
      question: `${xmlField(vote, "question")} ${xmlField(vote, "title")}`.trim(),
      result: xmlField(vote, "result"),
      url: senatePath(ref, "htm"),
      bill: parseSenateIssue(xmlField(vote, "issue"), congress),
    }
  })
}

const houseVoteUrl = (startDate: string, number: number): string =>
  `https://clerk.house.gov/Votes/${startDate.slice(0, 4)}${number}`

export const toHouseBill = (congress: number, type?: string, number?: string): BillRef | null =>
  type && number && HOUSE_BILL_TYPES.includes(type) ? { congress, type: type.toLowerCase(), number } : null

type HouseListed = z.infer<typeof houseListSchema>["houseRollCallVotes"][number]

const houseListPage = (key: string, congress: number, session: number, offset: number) =>
  getCongress(key, `/house-vote/${congress}/${session}`, { limit: String(PAGE_SIZE), offset: String(offset) }, houseListSchema)

const isLastPage = (received: number, offset: number, total?: number): boolean =>
  received < PAGE_SIZE || offset + PAGE_SIZE >= (total ?? MOST_RESULTS)

const houseList = async (key: string, congress: number, session: number, offset = 0): Promise<HouseListed[]> => {
  const page = await houseListPage(key, congress, session, offset)
  const votes = page?.houseRollCallVotes ?? []
  return isLastPage(votes.length, offset, page?.pagination?.count)
    ? votes
    : [...votes, ...(await houseList(key, congress, session, offset + PAGE_SIZE))]
}

type HouseMembersPage = z.infer<typeof houseMembersSchema>["houseRollCallVoteMemberVotes"]

const houseMembersPages = async (
  key: string,
  ref: RollCallRef,
  offset = 0,
  seenIds: string[] = [],
): Promise<HouseMembersPage[]> => {
  const page = await getCongress(
    key,
    `/house-vote/${ref.congress}/${ref.session}/${ref.number}/members`,
    { limit: String(PAGE_SIZE), offset: String(offset) },
    houseMembersSchema,
  )
  if (page === null) return []
  const votes = page.houseRollCallVoteMemberVotes
  const fresh = { ...votes, results: votes.results.filter((result) => !seenIds.includes(result.bioguideID)) }
  if (offset > 0 && fresh.results.length === 0) return []
  return isLastPage(votes.results.length, offset)
    ? [fresh]
    : [
        fresh,
        ...(await houseMembersPages(key, ref, offset + PAGE_SIZE, [
          ...seenIds,
          ...fresh.results.map((result) => result.bioguideID),
        ])),
      ]
}

const houseRollCall = async (key: string, ref: RollCallRef): Promise<RollCall | null> => {
  const pages = await houseMembersPages(key, ref)
  if (pages.length === 0) return null
  return {
    chamber: "us-house",
    ...ref,
    measure: [pages[0].legislationType, pages[0].legislationNumber].filter(Boolean).join(" "),
    members: pages.flatMap((page) =>
      page.results.map(
        (result): MemberVote => ({ id: result.bioguideID, firstName: result.firstName, lastName: result.lastName, vote: result.voteCast }),
      ),
    ),
  }
}

const inSequence = <Item, Result>(items: Item[], run: (item: Item) => Promise<Result>): Promise<Result[]> =>
  items.reduce<Promise<Result[]>>(async (done, item) => [...(await done), await run(item)], Promise.resolve([]))

const houseQuestion = async (key: string, ref: RollCallRef): Promise<string> =>
  (await getCongress(key, `/house-vote/${ref.congress}/${ref.session}/${ref.number}`, {}, houseItemSchema))?.houseRollCallVote
    .voteQuestion ?? ""

const toRef = (listed: HouseListed): RollCallRef => ({
  congress: listed.congress,
  session: listed.sessionNumber,
  number: listed.rollCallNumber,
})

export const createVoteSources = (): VoteSources => {
  const key = congressApiKey()
  const rollCall = async (chamber: Chamber, ref: RollCallRef): Promise<RollCall | null> => {
    if (chamber === "us-house") return houseRollCall(key, ref)
    const xml = await getText(senatePath(ref, "xml"))
    return xml === null ? null : parseSenateVote(xml, ref)
  }
  const latestRef = async (chamber: Chamber, congress: number): Promise<RollCallRef | null> => {
    if (chamber === "us-house") {
      const listed = [...(await houseList(key, congress, 2)), ...(await houseList(key, congress, 1))]
      const latest = listed.toSorted((a, b) => b.startDate.localeCompare(a.startDate))[0]
      return latest ? toRef(latest) : null
    }
    const menus = await inSequence([2, 1], async (session) => {
      const xml = await getText(senateMenuUrl(congress, session))
      return xml === null ? [] : parseSenateMenu(xml, congress, session)
    })
    return menus.flat().toSorted((a, b) => b.session - a.session || b.number - a.number)[0] ?? null
  }
  return {
    rollCall,
    latestRollCall: async (chamber, congress) => {
      const ref = await latestRef(chamber, congress)
      return ref === null ? null : rollCall(chamber, ref)
    },
    voteCount: async (chamber, congress, session) => {
      if (chamber === "us-house") {
        const page = await getCongress(key, `/house-vote/${congress}/${session}`, { limit: "1" }, houseListSchema)
        return page?.pagination?.count ?? page?.houseRollCallVotes.length ?? 0
      }
      const xml = await getText(senateMenuUrl(congress, session))
      return xml === null ? 0 : xmlBlocks(xml, "vote").length
    },
    votesSince: async (chamber, congress, session, since) => {
      if (chamber === "us-senate") {
        const xml = await getText(senateMenuUrl(congress, session))
        return xml === null ? [] : parseSenateMenu(xml, congress, session).filter((vote) => vote.date >= since)
      }
      const recent = (await houseList(key, congress, session)).filter(
        (listed) => listed.startDate.slice(0, 10) >= since && toHouseBill(listed.congress, listed.legislationType, listed.legislationNumber),
      )
      return inSequence(recent, async (listed): Promise<ListedVote> => ({
        chamber,
        ...toRef(listed),
        date: listed.startDate.slice(0, 10),
        question: await houseQuestion(key, toRef(listed)),
        result: listed.result ?? "",
        url: houseVoteUrl(listed.startDate, listed.rollCallNumber),
        bill: toHouseBill(listed.congress, listed.legislationType, listed.legislationNumber),
      }))
    },
    bill: async (bill) => {
      const found = await getCongress(key, `/bill/${bill.congress}/${bill.type}/${bill.number}`, {}, billSchema)
      return found === null ? null : { title: found.bill.title, policyArea: found.bill.policyArea?.name ?? null }
    },
  }
}
