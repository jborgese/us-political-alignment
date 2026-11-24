import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  loadPlannedCategories,
  loadRatingSet,
  type Key,
  type Packet,
  type PlannedCategory,
  type RatingSet,
  type Tier,
} from "./files.ts"
import { buildHomeData, buildHomePage } from "./home.ts"
import {
  REPO_URL,
  SITE_NAME,
  SYMBOLS,
  UNPUBLISHED,
  asDocument,
  axisFor,
  embedJson,
  escapeHtml,
  glyph,
  gridLines,
  icon,
  pageHead,
  partyKey,
  tickLabels,
  usPartyKey,
  type Axis,
  type SiteAssets,
  type SitePage,
} from "./markup.ts"
import { itemsInSlot, ratedPackets } from "./ratingSet.ts"
import { heldBackReasons, previousScores, summarizeRun } from "./report.ts"
import { wordingRange, type WordingRange } from "./stability.ts"

const HOME_HREF = "../"
const US_PARTIES = "US parties"
const LONGEST_PARTY_LABEL = 12
const FLAGS: Record<string, string> = { Canada: "ca", France: "fr", Germany: "de", "United Kingdom": "uk" }
const PARTY_SYMBOLS: Record<string, string> = { Democratic: "donkey", Republican: "elephant" }

type Subject = Key["subjects"][number]
export type SiteKind = Subject["kind"] | "anchor"

export interface SiteItem {
  tier: Tier
  text: string
  sources: string[]
}

export interface SiteSection {
  heading: string
  items: SiteItem[]
}

export interface SiteRecord {
  name: string
  label: string
  glyph: string
  flag: string | null
  party: string | null
  symbol: string | null
  kind: SiteKind
  detail: string
  group: string | null
  score: number
  previousScore: number | null
  range: WordingRange | null
  sections: SiteSection[]
}

export interface SiteData {
  title: string
  question: string
  highPole: string
  lowPole: string
  model: string
  comparisons: number
  ratedOn: string
  agreementAcrossOrders: number
  wonByFirstListed: number
  groups: SiteGroup[]
  records: SiteRecord[]
  selected: number
  heldBack: HeldBack[]
}

export interface SiteGroup {
  name: string
  kind: Exclude<SiteKind, "anchor" | "member">
  flag: string | null
}

export interface HeldBack {
  name: string
  reasons: string[]
}

export interface SiteIssue {
  id: string
  label: string
  href: string | null
  current: boolean
}

const initials = (name: string): string =>
  name
    .split(/[\s/]+/)
    .filter((word) => /^\p{Lu}/u.test(word))
    .map((word) => word[0])
    .join("")

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

type Placement = Pick<SiteRecord, "label" | "glyph" | "flag" | "detail" | "group">

const describeSubject = (subject: Subject): Placement => {
  if (subject.kind === "caucus") {
    const label = subject.aliases[0] ?? subject.name
    return { label, glyph: initials(subject.name), flag: null, detail: "House caucus", group: subject.name }
  }
  if (subject.kind === "party") {
    const short = subject.name.length <= LONGEST_PARTY_LABEL ? subject.name : (subject.aliases[0] ?? subject.name)
    const american = subject.legislature.startsWith("us-")
    return {
      label: short,
      glyph: initials(subject.name),
      flag: FLAGS[subject.group] ?? null,
      detail: american ? "US party" : subject.group,
      group: american ? US_PARTIES : subject.group,
    }
  }
  const words = subject.name.split(" ")
  return {
    label: subject.aliases[0] ?? subject.name,
    glyph: initials(`${words[0]} ${words[words.length - 1]}`),
    flag: null,
    detail: subject.group,
    group: subject.group,
  }
}

const sectionsOf = (set: RatingSet, packet: Packet): SiteSection[] =>
  set.category.slots.map((slot) => ({
    heading: slot.heading,
    items: itemsInSlot(packet, slot.id).map((item) => ({
      tier: item.tier,
      text: item.text,
      sources: item.sources ?? [],
    })),
  }))

const GROUP_ORDER: SiteGroup["kind"][] = ["caucus", "party"]

const groupOf = (records: SiteRecord[], name: string): SiteGroup => {
  const caucus = records.some((record) => record.group === name && record.kind !== "party")
  const flag = records.find((record) => record.group === name && record.flag)?.flag ?? null
  return { name, kind: caucus ? "caucus" : "party", flag }
}

const groupsOf = (records: SiteRecord[]): SiteGroup[] =>
  records
    .flatMap((record) => (record.group === null ? [] : [record.group]))
    .filter((name, index, all) => all.indexOf(name) === index)
    .map((name) => groupOf(records, name))
    .toSorted(
      (a, b) =>
        GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind) ||
        Number(a.flag !== null) - Number(b.flag !== null) ||
        a.name.localeCompare(b.name),
    )

const formatDay = (isoTime: string): string =>
  new Date(isoTime).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

export const buildSiteData = (set: RatingSet): SiteData => {
  const run = summarizeRun(set)
  if (!run.scaleIsValid) {
    throw new Error("The anchors did not come out in their intended order, so there is no valid scale to show.")
  }
  const packets = Object.fromEntries(ratedPackets(set).map((packet) => [packet.id, packet]))
  const earlier = previousScores(set)
  const scoreOf = (id: string): number => Math.round(run.scores[id]) || 0
  const previousOf = (id: string): number | null => (earlier ? Math.round(earlier[id]) || 0 : null)
  const rated = set.key.subjects
    .filter((subject) => subject.id in packets)
    .map((subject) => ({ subject, reasons: heldBackReasons(set, run, packets[subject.id]) }))
  const subjects: SiteRecord[] = rated
    .filter(({ reasons }) => reasons.length === 0)
    .map(({ subject }) => ({
      name: subject.name,
      kind: subject.kind,
      party: subject.party ?? null,
      symbol: PARTY_SYMBOLS[subject.party ?? ""] ?? null,
      ...describeSubject(subject),
      score: scoreOf(subject.id),
      previousScore: previousOf(subject.id),
      range: wordingRange(set, run.scores, run.reworded, subject.id) ?? null,
      sections: sectionsOf(set, packets[subject.id]),
    }))
  const anchors: SiteRecord[] = set.category.anchors.map((anchor) => {
    const name = capitalized(anchor.id.replace(/^anchor-/, ""))
    return {
      name,
      label: name,
      glyph: "",
      flag: null,
      party: null,
      symbol: null,
      kind: "anchor",
      detail: "Written reference record",
      group: null,
      score: scoreOf(anchor.id),
      previousScore: previousOf(anchor.id),
      range: null,
      sections: sectionsOf(set, anchor),
    }
  })
  const records = [...subjects, ...anchors].toSorted((a, b) => b.score - a.score)
  return {
    title: set.category.title,
    question: set.category.question,
    highPole: set.category.highPole,
    lowPole: set.category.lowPole,
    model: set.comparisons[0].model,
    comparisons: set.comparisons.length,
    ratedOn: formatDay(set.comparisons[set.comparisons.length - 1].ratedAt),
    agreementAcrossOrders: run.agreementAcrossOrders,
    wonByFirstListed: run.wonByFirstListed,
    groups: groupsOf(records),
    records,
    selected: records.findIndex((record) => record.kind !== "anchor"),
    heldBack: rated
      .filter(({ reasons }) => reasons.length > 0)
      .map(({ subject, reasons }) => ({ name: subject.name, reasons })),
  }
}

const percent = (share: number): string => `${Math.round(share * 100)}%`

const rangeBar = ({ score, range }: SiteRecord, axis: Axis): string =>
  range && range.high > range.low
    ? `<span class="range" style="--above:${axis.length(range.high - score)};--span:${axis.length(range.high - range.low)}"></span>`
    : ""

const spoken = ({ name, score, range }: SiteRecord): string =>
  range ? `${name}, ${score}, ${rangeText(range)} when reworded` : `${name}, ${score}`

const label = (record: SiteRecord): string =>
  record.kind === "anchor"
    ? `<span class="name">${escapeHtml(record.label)}</span>`
    : `<span class="leader"></span><span class="name"><b class="score">${record.score}</b>${escapeHtml(record.label)}<span class="detail">${escapeHtml(record.detail)}</span></span>`

const marker = (record: SiteRecord, index: number, axis: Axis): string => {
  const symbol = record.symbol ? ` data-symbol="${record.symbol}"` : ""
  const group = record.group === null ? "" : ` data-group="${escapeHtml(record.group)}"`
  return `<button type="button" class="marker" data-index="${index}" data-kind="${record.kind}"${symbol}${group} style="--y:${axis.position(record.score)}" aria-pressed="false" aria-label="${escapeHtml(spoken(record))}">${rangeBar(record, axis)}${glyph(record)}${label(record)}</button>`
}

const column = (data: SiteData, className: string, axis: Axis, keep: (record: SiteRecord) => boolean): string => {
  const markers = data.records.map((record, index) => (keep(record) ? marker(record, index, axis) : "")).join("")
  return `<div class="column ${className}">${gridLines(axis)}${markers}</div>`
}

const groupIcon = (group: SiteGroup): string =>
  group.flag
    ? `<span class="group-flag" data-kind="party">${glyph({ glyph: "", flag: group.flag, symbol: null })}</span>`
    : icon(group.kind === "caucus" ? "caucus" : "party")

const groupButtons = (groups: SiteGroup[]): string =>
  `<ul class="groups" aria-label="Highlight a group">${groups
    .map(
      (group) =>
        `<li><button type="button" class="group" data-group="${escapeHtml(group.name)}" aria-pressed="false">${groupIcon(group)}${escapeHtml(group.name)}</button></li>`,
    )
    .join("")}</ul>`

const isReworded = (records: SiteRecord[]): boolean => records.some((record) => record.range !== null)

const rangeText = ({ low, high }: WordingRange): string => (low === high ? String(low) : `${low} to ${high}`)

const tableRows = (data: SiteData): string =>
  data.records
    .map((record) => {
      const rank = data.records.filter((other) => other.kind !== "anchor" && other.score > record.score).length + 1
      const range = isReworded(data.records) ? `<td class="num">${record.range ? rangeText(record.range) : ""}</td>` : ""
      return `<tr><td class="num">${record.kind === "anchor" ? "" : rank}</td><td>${escapeHtml(record.name)}</td><td>${escapeHtml(record.detail)}</td><td class="num">${record.score}</td><td class="num">${record.previousScore ?? ""}</td>${range}</tr>`
    })
    .join("")

const largestMove = (records: SiteRecord[]): string => {
  const moves = records.flatMap((record) =>
    record.kind === "anchor" || record.previousScore === null ? [] : [Math.abs(record.score - record.previousScore)],
  )
  return moves.length > 0
    ? `<li>${icon("move")}<strong>${Math.max(...moves)}</strong> points was the largest move since the previous run</li>`
    : ""
}

const largestRewordedMove = (records: SiteRecord[]): string => {
  const moves = records.flatMap(({ score, range }) => (range ? [range.high - score, score - range.low] : []))
  return moves.length > 0
    ? `<li>${icon("reword")}<strong>${Math.max(...moves)}</strong> points was the largest move when reworded</li>`
    : ""
}

const heldBack = (records: HeldBack[]): string =>
  records.length > 0
    ? `<details class="held-back"><summary>${records.length} held back from the chart</summary><ul>${records
        .map((record) => `<li><b>${escapeHtml(record.name)}</b>: ${escapeHtml(record.reasons.join("; "))}</li>`)
        .join("")}</ul></details>`
    : ""

const issueLink = ({ id, label, href, current }: SiteIssue): string => {
  const content = `${icon(`issue-${id}`)}${escapeHtml(label)}`
  if (href === null) return `<li><span class="issue unpublished" title="${UNPUBLISHED}">${content}</span></li>`
  return `<li><a class="issue" href="${escapeHtml(href)}"${current ? ` aria-current="page"` : ""}>${content}</a></li>`
}

const issueNav = (issues: SiteIssue[]): string =>
  issues.length > 0 ? `<nav aria-label="Issues"><ul class="issues">${issues.map(issueLink).join("")}</ul></nav>` : ""

export const buildSitePage = (data: SiteData, assets: SiteAssets, issues: SiteIssue[]): SitePage => {
  const axis = axisFor(data.records.map((record) => record.score))
  return {
    head: pageHead(assets.css),
    body: [
      SYMBOLS,
      `<main class="page">`,
      `<header class="masthead"><div class="site-name"><a href="${HOME_HREF}">${SITE_NAME}</a> <span class="pilot">Pilot</span></div>${issueNav(issues)}<h1>${escapeHtml(data.title)}</h1><p class="question">${escapeHtml(data.question)}</p></header>`,
      `<ul class="checks" aria-label="Checks on this run">`,
      `<li>${icon("check", "icon ok")}Reference records in order</li>`,
      `<li>${icon("orders")}<strong>${percent(data.agreementAcrossOrders)}</strong> same result in both orders</li>`,
      `<li>${icon("balance")}<strong>${percent(data.wonByFirstListed)}</strong> won by the record shown first</li>`,
      largestMove(data.records),
      largestRewordedMove(data.records),
      `</ul>`,
      `<section class="scale" aria-label="Records by strength of support">`,
      `<ul class="key" aria-label="Marker key">${partyKey(data.records)}<li><span class="glyph"></span>Member</li><li><span class="glyph caucus"></span>Caucus</li>${usPartyKey(data.records)}<li><span class="glyph anchor"></span>Reference record</li>${isReworded(data.records) ? `<li><span class="range-key"></span>Range when reworded</li>` : ""}</ul>`,
      groupButtons(data.groups),
      `<div class="pole">${icon("shield")}${escapeHtml(capitalized(data.highPole))}</div>`,
      `<div class="plot one-scale">`,
      `<div class="y-axis">${tickLabels(axis)}</div>`,
      column(data, "records", axis, (record) => record.kind !== "anchor"),
      column(data, "reference", axis, (record) => record.kind === "anchor"),
      `</div>`,
      `<div class="pole">${icon("cut")}${escapeHtml(capitalized(data.lowPole))}</div>`,
      `<p class="scale-note">${icon("move")}Only height is measured. Marks shift sideways only to stay visible.</p>`,
      `</section>`,
      heldBack(data.heldBack),
      `<section class="evidence" aria-live="polite" aria-label="Evidence for the selected record">`,
      `<div class="evidence-head" id="evidence-head"><span class="glyph" id="evidence-glyph"></span><div class="who"><h2 id="evidence-name"></h2><p id="evidence-detail"></p></div><div class="score"><b id="evidence-score"></b><span>on the 0 to 100 scale</span><span id="evidence-change"></span><span id="evidence-range"></span></div></div>`,
      `<ul class="tier-key" aria-label="Kinds of evidence"><li>${icon("official_act")}Official act</li><li>${icon("influence")}Influence</li><li>${icon("statement")}Statement</li></ul>`,
      `<div class="sections" id="evidence-sections"></div>`,
      `</section>`,
      `<details class="table"><summary>All records as a table</summary><div class="table-scroll"><table><thead><tr><th class="num">Rank</th><th>Record</th><th>Group</th><th class="num">Score</th><th class="num">Previous run</th>${isReworded(data.records) ? `<th class="num">When reworded</th>` : ""}</tr></thead><tbody>${tableRows(data)}</tbody></table></div></details>`,
      `<footer><span>${data.comparisons} blinded comparisons, rated by ${escapeHtml(data.model)} on ${escapeHtml(data.ratedOn)}</span><a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">Method and data</a></footer>`,
      `</main>`,
      `<div class="tooltip" id="tooltip" hidden></div>`,
      `<script type="application/json" id="site-data">${embedJson(data)}</script>`,
      `<script>${assets.js}</script>`,
    ].join("\n"),
  }
}

const readAsset = (name: string): Promise<string> => readFile(new URL(`../site/${name}`, import.meta.url), "utf8")

const issuesFor = (planned: PlannedCategory[], published: Record<string, SiteData>, currentId: string): SiteIssue[] =>
  planned.map(({ id, label }) => ({
    id,
    label,
    href: id in published ? `${HOME_HREF}${id}/` : null,
    current: id === currentId,
  }))

export const writeSite = async (root: string): Promise<string[]> => {
  const [planned, css, dodgeScript, pageScript, homeScript] = await Promise.all([
    loadPlannedCategories(fileURLToPath(new URL("../site/categories.json", import.meta.url))),
    readAsset("style.css"),
    readAsset("dodge.js"),
    readAsset("app.js"),
    readAsset("home.js"),
  ])
  const ids = planned.filter((category) => category.published).map(({ id }) => id)
  const sets = await Promise.all(ids.map((id) => loadRatingSet(root, id)))
  const published = Object.fromEntries(ids.map((id, index) => [id, buildSiteData(sets[index])]))
  const pages = [
    { file: "index.html", page: buildHomePage(buildHomeData(planned, published), { css, js: `${dodgeScript}\n${homeScript}` }) },
    ...Object.entries(published).map(([id, data]) => ({
      file: path.join(id, "index.html"),
      page: buildSitePage(data, { css, js: `${dodgeScript}\n${pageScript}` }, issuesFor(planned, published, id)),
    })),
  ]
  return Promise.all(
    pages.map(async ({ file, page }) => {
      const target = path.join(root, "dist", file)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, asDocument(page))
      return target
    }),
  )
}
