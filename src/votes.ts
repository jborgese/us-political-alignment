import type { Key } from "./files.ts"

export const CHAMBERS = ["us-house", "us-senate"] as const
export type Chamber = (typeof CHAMBERS)[number]

export const VOTED_FOR = "Voted for"
export const VOTED_AGAINST = "Voted against"
export const CANDIDATE_WINDOW_DAYS = 14

export interface RollCallRef {
  congress: number
  session: number
  number: number
}

export interface MemberVote {
  id: string
  firstName: string
  lastName: string
  vote: string
}

export interface RollCall extends RollCallRef {
  chamber: Chamber
  measure: string
  members: MemberVote[]
}

export interface BillRef {
  congress: number
  type: string
  number: string
}

export interface ListedVote extends RollCallRef {
  chamber: Chamber
  date: string
  question: string
  result: string
  url: string
  bill: BillRef | null
}

export interface Candidate extends ListedVote {
  title: string
  policyArea: string | null
}

export interface VoteEvent {
  id: string
  slot: string
  rollCall?: RollCallRef
}

export interface RecordItem {
  event?: string
  stance?: string
  tier?: string
  [field: string]: unknown
}

export interface RecordContent {
  items: RecordItem[]
  emptySlots?: string[]
  noPosition?: string[]
  [field: string]: unknown
}

export interface RecordUpdate {
  content: RecordContent
  added: { event: string; stance: string }[]
  listedNoPosition: string[]
  disagreements: { event: string; stance: string; vote: string }[]
  statementsWithVotes: { event: string; vote: string }[]
  full: string[]
}

type Subject = Key["subjects"][number]

export const isChamber = (legislature: string): legislature is Chamber =>
  (CHAMBERS as readonly string[]).includes(legislature)

export const rollCallKey = (chamber: Chamber, ref: RollCallRef): string =>
  `${chamber}:${ref.congress}-${ref.session}-${ref.number}`

export const describeRollCall = (chamber: Chamber, ref: RollCallRef): string =>
  `${chamber === "us-house" ? "House" : "Senate"} ${ref.congress}-${ref.session} roll ${ref.number}`

export const stanceFor = (vote: string): string | undefined => {
  if (vote === "Yea" || vote === "Aye") return VOTED_FOR
  if (vote === "Nay" || vote === "No") return VOTED_AGAINST
  return undefined
}

export const congressOn = (date: Date): { congress: number; session: number } => {
  const beforeTermStarts = date.getUTCMonth() === 0 && date.getUTCDate() < 3
  const yearsSinceFirst = date.getUTCFullYear() - (beforeTermStarts ? 1 : 0) - 1789
  return { congress: Math.floor(yearsSinceFirst / 2) + 1, session: (yearsSinceFirst % 2) + 1 }
}

const withoutValue = (values: string[] | undefined, value: string): string[] | undefined =>
  values?.filter((candidate) => candidate !== value)

const setList = (content: RecordContent, field: "emptySlots" | "noPosition", values: string[] | undefined) => {
  if (values === undefined) return content
  if (values.length > 0) return { ...content, [field]: values }
  const { [field]: _removed, ...rest } = content
  return rest as RecordContent
}

const insertAfterLastStance = (items: RecordItem[], item: RecordItem): RecordItem[] => {
  const lastStance = items.findLastIndex((candidate) => candidate.event !== undefined)
  const at = lastStance === -1 ? items.length : lastStance + 1
  return [...items.slice(0, at), item, ...items.slice(at)]
}

const plainOpposite = (stance: string, vote: string): boolean => {
  const fromVote = stanceFor(vote)
  return (stance === VOTED_FOR || stance === VOTED_AGAINST) && fromVote !== undefined && fromVote !== stance
}

const emptyUpdate = (content: RecordContent): RecordUpdate => ({
  content,
  added: [],
  listedNoPosition: [],
  disagreements: [],
  statementsWithVotes: [],
  full: [],
})

export const updateRecord = (
  content: RecordContent,
  events: VoteEvent[],
  votes: Record<string, string | null>,
  maxItems: number,
): RecordUpdate =>
  events
    .filter((event) => event.id in votes)
    .reduce<RecordUpdate>((update, event) => {
      const vote = votes[event.id]
      const existing = update.content.items.find((item) => item.event === event.id)
      if (existing) {
        const stance = String(existing.stance ?? "")
        if (vote === null || stanceFor(vote) === undefined) return update
        if (existing.tier === "statement") {
          return { ...update, statementsWithVotes: [...update.statementsWithVotes, { event: event.id, vote }] }
        }
        return plainOpposite(stance, vote)
          ? { ...update, disagreements: [...update.disagreements, { event: event.id, stance, vote }] }
          : update
      }
      const stance = vote === null ? undefined : stanceFor(vote)
      if (stance === undefined) {
        if ((update.content.noPosition ?? []).includes(event.id)) return update
        return {
          ...update,
          content: { ...update.content, noPosition: [...(update.content.noPosition ?? []), event.id] },
          listedNoPosition: [...update.listedNoPosition, event.id],
        }
      }
      if (update.content.items.length >= maxItems) return { ...update, full: [...update.full, event.id] }
      const withItem = { ...update.content, items: insertAfterLastStance(update.content.items, { event: event.id, stance }) }
      const withoutNoPosition = setList(withItem, "noPosition", withoutValue(withItem.noPosition, event.id))
      return {
        ...update,
        content: setList(withoutNoPosition, "emptySlots", withoutValue(withoutNoPosition.emptySlots, event.slot)),
        added: [...update.added, { event: event.id, stance }],
      }
    }, emptyUpdate(content))

const normalizeName = (name: string): string =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()

export interface IdMatch {
  subjectId: string
  rollCallId: string
  matchedName: string
}

export const matchRollCallIds = (
  subjects: Subject[],
  latest: Partial<Record<Chamber, MemberVote[]>>,
): { matched: IdMatch[]; unmatched: string[] } => {
  const usedIds = subjects.flatMap((subject) => (subject.rollCallId ? [subject.rollCallId] : []))
  const waiting = subjects.filter(
    (subject) => subject.kind === "member" && isChamber(subject.legislature) && !subject.rollCallId,
  )
  const results = waiting.map((subject) => {
    const members = latest[subject.legislature as Chamber] ?? []
    const found = members.filter(
      (member) =>
        normalizeName(`${member.firstName} ${member.lastName}`) === normalizeName(subject.name) &&
        !usedIds.includes(member.id),
    )
    return found.length === 1
      ? { subjectId: subject.id, match: { rollCallId: found[0].id, matchedName: `${found[0].firstName} ${found[0].lastName}` } }
      : { subjectId: subject.id, match: null }
  })
  return {
    matched: results.flatMap(({ subjectId, match }) => (match ? [{ subjectId, ...match }] : [])),
    unmatched: results.flatMap(({ subjectId, match }) => (match ? [] : [subjectId])),
  }
}

export const provisionalEnds = (
  subjects: Subject[],
  secondSessionVotes: Record<string, number>,
): { ended: string[]; withoutFirstCongress: string[] } => {
  const provisional = subjects.filter((subject) => subject.provisional === true && isChamber(subject.legislature))
  return {
    ended: provisional
      .filter(
        (subject) =>
          subject.firstCongress !== undefined &&
          (secondSessionVotes[`${subject.legislature}:${subject.firstCongress}`] ?? 0) > 0,
      )
      .map((subject) => subject.id),
    withoutFirstCongress: provisional.filter((subject) => subject.firstCongress === undefined).map((subject) => subject.id),
  }
}

export const updateKeyContent = (
  content: { subjects: Record<string, unknown>[]; [field: string]: unknown },
  matched: IdMatch[],
  ended: string[],
): { subjects: Record<string, unknown>[]; [field: string]: unknown } => ({
  ...content,
  subjects: content.subjects.map((subject) => {
    const match = matched.find(({ subjectId }) => subjectId === subject.id)
    const withId = match ? { ...subject, rollCallId: match.rollCallId } : subject
    if (!ended.includes(String(subject.id))) return withId
    const { provisional: _provisional, ...rest } = withId
    return rest
  }),
})

export const isPassageVote = (question: string): boolean =>
  !/cloture|to proceed|to table|recommit|to commit|previous question/i.test(question) &&
  /\b(passage|pass|concur|conference report|overrid|joint resolution)/i.test(question)

export const sortCandidates = (
  candidates: Candidate[],
  policyAreas: Record<string, string[]>,
  linkedKeys: string[],
): { byCategory: Record<string, Candidate[]>; other: Candidate[] } => {
  const fresh = candidates
    .filter((candidate) => candidate.bill !== null && isPassageVote(candidate.question))
    .filter((candidate) => !linkedKeys.includes(rollCallKey(candidate.chamber, candidate)))
    .toSorted((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
  const inCategory = (categoryId: string) => (candidate: Candidate) =>
    candidate.policyArea !== null && policyAreas[categoryId].includes(candidate.policyArea)
  return {
    byCategory: Object.fromEntries(
      Object.keys(policyAreas).map((categoryId) => [categoryId, fresh.filter(inCategory(categoryId))]),
    ),
    other: fresh.filter((candidate) => !Object.keys(policyAreas).some((categoryId) => inCategory(categoryId)(candidate))),
  }
}

export const billLabel = (bill: BillRef): string => {
  const labels: Record<string, string> = { hr: "H.R.", s: "S.", hjres: "H.J.Res.", sjres: "S.J.Res." }
  return `${labels[bill.type] ?? bill.type.toUpperCase()} ${bill.number}`
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim()

const formatDay = (isoDate: string): string =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

const candidateLine = (candidate: Candidate): string =>
  [
    `- [${describeRollCall(candidate.chamber, candidate)}](${candidate.url}), ${formatDay(candidate.date)}: `,
    `${candidate.bill ? billLabel(candidate.bill) : ""}, ${oneLine(candidate.question)} (${oneLine(candidate.result)}). `,
    candidate.title ? `*${oneLine(candidate.title)}* ` : "",
    `Policy area: ${candidate.policyArea ?? "none yet"}`,
  ].join("")

export const issueBody = (
  sorted: { byCategory: Record<string, Candidate[]>; other: Candidate[] },
  labels: Record<string, string>,
  notices: string[],
  today: string,
): string =>
  [
    ...notices,
    `Passage votes from the last ${CANDIDATE_WINDOW_DAYS} days that no event names yet, listed under each issue whose policy areas in \`votes.json\` include the bill's. A bill's policy area follows its original text, so a vote used as a vehicle for something else lands under "Other passage votes". Updated by the vote listener; last run ${formatDay(today)}.`,
    "",
    ...Object.entries(sorted.byCategory).flatMap(([categoryId, list]) => [
      `### ${labels[categoryId] ?? categoryId}`,
      "",
      ...(list.length > 0 ? list.map(candidateLine) : ["None."]),
      "",
    ]),
    `<details><summary>Other passage votes (${sorted.other.length})</summary>`,
    "",
    ...(sorted.other.length > 0 ? sorted.other.map(candidateLine) : ["None."]),
    "",
    "</details>",
    "",
  ].join("\n")

export interface RecordChange {
  categoryId: string
  subject: Subject
  update: RecordUpdate
}

export interface ReRating {
  categoryId: string
  scale: number
  placement: number | null
  problems: string[]
}

export interface ListenerSummary {
  changes: RecordChange[]
  idMatches: (IdMatch & { name: string })[]
  withoutId: Subject[]
  provisionalEnded: Subject[]
  withoutFirstCongress: Subject[]
  reRating: ReRating[] | null
}

const subjectLabel = (subject: Subject): string => `${subject.name} (${subject.id})`

const section = (heading: string, lines: string[]): string[] =>
  lines.length === 0 ? [] : [`#### ${heading}`, "", ...lines, ""]

export const hasFileChanges = (summary: ListenerSummary): boolean =>
  summary.idMatches.length > 0 ||
  summary.provisionalEnded.length > 0 ||
  summary.changes.some(({ update }) => update.added.length > 0 || update.listedNoPosition.length > 0)

const reRatingLines = (reRating: ReRating[] | null): string[] => {
  if (reRating === null) return ["- Run `npm run votes -- write` to count the comparisons to re-rate."]
  return reRating.map(({ categoryId, scale, placement }) =>
    [
      `- **${categoryId}**: \`npm run rate -- ${categoryId}\` (${scale} comparisons)`,
      placement === null ? "" : `, then \`npm run place -- ${categoryId}\` (${placement} comparisons)`,
    ].join(""),
  )
}

export const prDetails = (summary: ListenerSummary, rollCalls: Record<string, string>): string[] => [
  ...section(
    "Stances added from the roll call",
    summary.changes.flatMap(({ categoryId, subject, update }) =>
      update.added.map(
        ({ event, stance }) =>
          `- ${categoryId}: ${subjectLabel(subject)}, ${stance} \`${event}\` (${rollCalls[`${categoryId}/${event}`] ?? "roll call"})`,
      ),
    ),
  ),
  ...section(
    "Listed under noPosition: present, not voting, or not in the chamber",
    summary.changes.flatMap(({ categoryId, subject, update }) =>
      update.listedNoPosition.map((event) => `- ${categoryId}: ${subjectLabel(subject)}, \`${event}\``),
    ),
  ),
  ...section(
    "Roll call IDs filled: check each match",
    summary.idMatches.map(({ subjectId, name, rollCallId, matchedName }) => `- ${name} (${subjectId}): ${rollCallId}, listed as ${matchedName}`),
  ),
  ...section(
    "Provisional status ended: the second session of their first Congress has begun",
    summary.provisionalEnded.map((subject) => `- ${subjectLabel(subject)}`),
  ),
  ...section(
    "Problems `check` will report",
    (summary.reRating ?? []).flatMap(({ categoryId, problems }) => problems.map((problem) => `- ${categoryId}: ${problem}`)),
  ),
  ...section("Re-rate before merging", hasFileChanges(summary) ? reRatingLines(summary.reRating) : []),
]

export const noticeLines = (summary: ListenerSummary, missingRollCalls: string[]): string[] => [
  ...section(
    "Roll calls not found",
    missingRollCalls.map((rollCall) => `- ${rollCall}: check the event's \`rollCall\`, or wait for the source to publish it`),
  ),
  ...section(
    "Not added: the record is at the 12-item limit",
    summary.changes.flatMap(({ categoryId, subject, update }) =>
      update.full.map((event) => `- ${categoryId}: ${subjectLabel(subject)}, \`${event}\`. Choose an item to drop, then run the listener again.`),
    ),
  ),
  ...section(
    "Stances that disagree with the roll call (not changed)",
    summary.changes.flatMap(({ categoryId, subject, update }) =>
      update.disagreements.map(
        ({ event, stance, vote }) => `- ${categoryId}: ${subjectLabel(subject)} says "${stance}" on \`${event}\`; the roll call shows ${vote}`,
      ),
    ),
  ),
  ...section(
    "Statement stances that now have a recorded vote (not changed)",
    summary.changes.flatMap(({ categoryId, subject, update }) =>
      update.statementsWithVotes.map(
        ({ event, vote }) => `- ${categoryId}: ${subjectLabel(subject)} on \`${event}\`: the roll call shows ${vote}. Replace the stated position with the vote when the record is rebuilt.`,
      ),
    ),
  ),
  ...section(
    "Members with no roll call ID",
    summary.withoutId.map((subject) => `- ${subjectLabel(subject)}: no unique name match in the latest roll call of the current Congress`),
  ),
  ...section(
    "Provisional members with no firstCongress",
    summary.withoutFirstCongress.map((subject) => `- ${subjectLabel(subject)}: add \`firstCongress\` to its key entry so its provisional status can end`),
  ),
]

export const prBody = (summary: ListenerSummary, rollCalls: Record<string, string>): string =>
  [
    "### **Ticket:** N/A",
    "",
    "### Changes",
    "",
    "#### Affected Resources:",
    "",
    "- [ ] Docs / Agent Guidance",
    "- [ ] CI / Repo Config",
    `- [${hasFileChanges(summary) ? "x" : " "}] Evidence`,
    "- [ ] Runs",
    "- [ ] Site",
    "- [ ] Rating tool (`src/`)",
    "",
    "#### Details:",
    "",
    "Opened by the vote listener from House and Senate roll calls. It stays a draft until the issues below are re-rated on this branch: the site build refuses stale comparisons.",
    "",
    ...prDetails(summary, rollCalls),
    "### Testing",
    "",
    "- Stances come from the roll call named by each event's `rollCall`; existing stances were compared, not changed.",
    "- Before merging: re-rate on this branch, commit the runs, and run `npm run check` for each issue listed.",
    "",
  ].join("\n")
