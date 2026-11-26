import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { remainingMatchups } from "./comparisons.ts"
import {
  loadPlannedCategories,
  loadRatingSet,
  loadVotesConfig,
  MAX_ITEMS_PER_PACKET,
  pathsFor,
  type PolicyEvent,
  type RatingSet,
} from "./files.ts"
import { remainingPlacementMatchups } from "./placement.ts"
import { panelFor } from "./rate.ts"
import { findSetProblems } from "./ratingSet.ts"
import { createVoteSources, type Bill, type VoteSources } from "./voteSources.ts"
import {
  CANDIDATE_WINDOW_DAYS,
  CHAMBERS,
  congressOn,
  describeRollCall,
  hasFileChanges,
  isChamber,
  isPassageVote,
  issueBody,
  matchRollCallIds,
  noticeLines,
  prBody,
  provisionalEnds,
  rollCallKey,
  sortCandidates,
  updateKeyContent,
  updateRecord,
  type Candidate,
  type Chamber,
  type ListenerSummary,
  type RecordChange,
  type ReRating,
  type RollCall,
  type RollCallRef,
} from "./votes.ts"

export interface ListenerOutcome {
  pr: string | null
  issue: string
  changedFiles: string[]
}

interface LinkedEvent {
  categoryId: string
  chamber: Chamber
  event: PolicyEvent
  ref: RollCallRef
}

const DAY_MS = 86_400_000

const readJsonFile = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, "utf8"))

const writeJsonFile = (file: string, value: unknown): Promise<void> => writeFile(file, `${JSON.stringify(value, null, 2)}\n`)

const inSequence = <Item, Result>(items: Item[], run: (item: Item) => Promise<Result>): Promise<Result[]> =>
  items.reduce<Promise<Result[]>>(async (done, item) => [...(await done), await run(item)], Promise.resolve([]))

const unique = (values: string[]): string[] => values.filter((value, index) => values.indexOf(value) === index)

const memberRecordFile = (root: string, set: RatingSet, categoryId: string, subjectId: string): string | null => {
  const paths = pathsFor(root, categoryId)
  if (set.packets.some((packet) => packet.id === subjectId)) return path.join(paths.packets, `${subjectId}.json`)
  if (set.placements.some((placed) => placed.id === subjectId)) return path.join(paths.placements, `${subjectId}.json`)
  return null
}

const linkedEvents = (sets: RatingSet[], categoryIds: string[]): LinkedEvent[] =>
  sets.flatMap((set, index) =>
    set.legislatures.flatMap((legislature) =>
      isChamber(legislature.id)
        ? legislature.events.flatMap((event) =>
            event.rollCall
              ? [{ categoryId: categoryIds[index], chamber: legislature.id as Chamber, event, ref: event.rollCall }]
              : [],
          )
        : [],
    ),
  )

const reRatingFor = async (root: string, categoryId: string): Promise<ReRating> => {
  const set = await loadRatingSet(root, categoryId)
  const panel = set.placements.length === 0 ? null : panelFor(set)
  return {
    categoryId,
    scale: remainingMatchups(set).length,
    placement: panel === null ? null : remainingPlacementMatchups(set, panel).length,
    problems: findSetProblems(set),
  }
}

const isoDay = (date: Date): string => date.toISOString().slice(0, 10)

const candidateVotes = async (
  sources: VoteSources,
  chambers: Chamber[],
  now: Date,
  linkedKeys: string[],
): Promise<Candidate[]> => {
  const { congress, session } = congressOn(now)
  const sessions = session === 1 ? [[congress, 1], [congress - 1, 2]] : [[congress, session], [congress, session - 1]]
  const since = isoDay(new Date(now.getTime() - CANDIDATE_WINDOW_DAYS * DAY_MS))
  const listed = (
    await inSequence(
      chambers.flatMap((chamber) => sessions.map(([c, s]) => ({ chamber, congress: c, session: s }))),
      (scan) => sources.votesSince(scan.chamber, scan.congress, scan.session, since),
    )
  ).flat()
  const passage = listed.filter(
    (vote) => vote.bill !== null && isPassageVote(vote.question) && !linkedKeys.includes(rollCallKey(vote.chamber, vote)),
  )
  const billKey = (vote: (typeof passage)[number]): string => JSON.stringify(vote.bill)
  const bills = Object.fromEntries(
    await inSequence(unique(passage.map(billKey)), async (keyText): Promise<[string, Bill | null]> => [
      keyText,
      await sources.bill(JSON.parse(keyText)),
    ]),
  )
  return passage.map((vote) => ({
    ...vote,
    title: bills[billKey(vote)]?.title ?? "",
    policyArea: bills[billKey(vote)]?.policyArea ?? null,
  }))
}

export const listenForVotes = async (root: string, write: boolean, now: Date): Promise<ListenerOutcome> => {
  const categoryIds = (await readdir(path.join(root, "categories")))
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.basename(name, ".json"))
    .toSorted()
  const sets = await Promise.all(categoryIds.map((categoryId) => loadRatingSet(root, categoryId)))
  const key = sets[0]?.key
  if (!key) throw new Error("There are no categories to listen for.")
  const config = await loadVotesConfig(root)
  const unknownIds = Object.keys(config.policyAreas).filter((categoryId) => !categoryIds.includes(categoryId))
  if (unknownIds.length > 0) throw new Error(`votes.json lists policy areas for unknown categories: ${unknownIds.join(", ")}`)
  const labels = Object.fromEntries(
    (await loadPlannedCategories(path.join(root, "site", "categories.json"))).map((planned) => [planned.id, planned.label]),
  )
  const chambers = CHAMBERS.filter(
    (chamber) =>
      key.subjects.some((subject) => subject.legislature === chamber) ||
      sets.some((set) => set.legislatures.some((legislature) => legislature.id === chamber)),
  )
  const { congress } = congressOn(now)
  const sources = createVoteSources()

  const waitingChambers = chambers.filter((chamber) =>
    key.subjects.some((subject) => subject.kind === "member" && subject.legislature === chamber && !subject.rollCallId),
  )
  const latest = Object.fromEntries(
    await inSequence(waitingChambers, async (chamber) => [chamber, (await sources.latestRollCall(chamber, congress))?.members ?? []]),
  )
  const { matched, unmatched } = matchRollCallIds(key.subjects, latest)
  const subjects = key.subjects.map((subject) => {
    const match = matched.find(({ subjectId }) => subjectId === subject.id)
    return match ? { ...subject, rollCallId: match.rollCallId } : subject
  })

  const firstCongresses = unique(
    subjects
      .filter((subject) => subject.provisional === true && isChamber(subject.legislature) && subject.firstCongress !== undefined)
      .map((subject) => `${subject.legislature}:${subject.firstCongress}`),
  )
  const secondSessionVotes = Object.fromEntries(
    await inSequence(firstCongresses, async (sessionKey) => {
      const [chamber, firstCongress] = sessionKey.split(":")
      return [sessionKey, await sources.voteCount(chamber as Chamber, Number(firstCongress), 2)]
    }),
  )
  const { ended, withoutFirstCongress } = provisionalEnds(subjects, secondSessionVotes)

  const linked = linkedEvents(sets, categoryIds)
  const linkedKeys = unique(linked.map(({ chamber, ref }) => rollCallKey(chamber, ref)))
  const rollCalls: Record<string, RollCall | null> = Object.fromEntries(
    await inSequence(linkedKeys, async (rollCallKeyText) => {
      const { chamber, ref } = linked.find((link) => rollCallKey(link.chamber, link.ref) === rollCallKeyText) as LinkedEvent
      return [rollCallKeyText, await sources.rollCall(chamber, ref)]
    }),
  )

  const members = subjects.filter((subject) => subject.kind === "member" && isChamber(subject.legislature) && subject.rollCallId)
  const recordTargets = sets.flatMap((set, index) =>
    members.flatMap((subject) => {
      const file = memberRecordFile(root, set, categoryIds[index], subject.id)
      return file ? [{ set, categoryId: categoryIds[index], subject, file }] : []
    }),
  )
  const changes = await inSequence(recordTargets, async ({ set, categoryId, subject, file }) => {
    const events = (set.legislatures.find((legislature) => legislature.id === subject.legislature)?.events ?? []).filter(
      (event) => event.rollCall,
    )
    const votes = Object.fromEntries(
      events.flatMap((event) => {
        const rollCall = rollCalls[rollCallKey(subject.legislature as Chamber, event.rollCall as RollCallRef)]
        return rollCall ? [[event.id, rollCall.members.find((member) => member.id === subject.rollCallId)?.vote ?? null]] : []
      }),
    )
    const content = (await readJsonFile(file)) as Parameters<typeof updateRecord>[0]
    return { categoryId, subject, file, update: updateRecord(content, events, votes, MAX_ITEMS_PER_PACKET) }
  })
  const changedRecords = changes.filter(({ update }) => update.added.length + update.listedNoPosition.length > 0)
  const keyFile = pathsFor(root, categoryIds[0]).key
  const keyChanged = matched.length > 0 || ended.length > 0

  if (write) {
    await Promise.all(changedRecords.map(({ file, update }) => writeJsonFile(file, update.content)))
    if (keyChanged) {
      const content = (await readJsonFile(keyFile)) as Parameters<typeof updateKeyContent>[0]
      await writeJsonFile(keyFile, updateKeyContent(content, matched, ended))
    }
  }

  const reRating = write
    ? await inSequence(unique(changedRecords.map(({ categoryId }) => categoryId)), (categoryId) => reRatingFor(root, categoryId))
    : null
  const subjectById = (id: string) => subjects.find((subject) => subject.id === id) as (typeof subjects)[number]
  const summary: ListenerSummary = {
    changes: changes.map(({ categoryId, subject, update }): RecordChange => ({ categoryId, subject, update })),
    idMatches: matched.map((match) => ({ ...match, name: subjectById(match.subjectId).name })),
    withoutId: unmatched.map(subjectById),
    provisionalEnded: ended.map(subjectById),
    withoutFirstCongress: withoutFirstCongress.map(subjectById),
    reRating,
  }
  const descriptions = Object.fromEntries(
    linked.map(({ categoryId, chamber, event, ref }) => {
      const measure = rollCalls[rollCallKey(chamber, ref)]?.measure
      return [`${categoryId}/${event.id}`, `${describeRollCall(chamber, ref)}${measure ? `, ${measure}` : ""}`]
    }),
  )
  const missing = linkedKeys.filter((rollCallKeyText) => rollCalls[rollCallKeyText] === null).map((rollCallKeyText) => {
    const { chamber, ref } = linked.find((link) => rollCallKey(link.chamber, link.ref) === rollCallKeyText) as LinkedEvent
    return describeRollCall(chamber, ref)
  })
  const candidates = await candidateVotes(sources, chambers, now, linkedKeys)
  return {
    pr: hasFileChanges(summary) ? prBody(summary, descriptions) : null,
    issue: issueBody(sortCandidates(candidates, config.policyAreas, linkedKeys), labels, noticeLines(summary, missing), isoDay(now)),
    changedFiles: [...changedRecords.map(({ file }) => file), ...(keyChanged ? [keyFile] : [])],
  }
}
