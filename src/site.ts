import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { loadRatingSet, type Key, type Packet, type RatingSet, type Tier } from "./files.ts"
import { itemsInSlot, ratedPackets } from "./ratingSet.ts"
import { summarizeRun } from "./report.ts"

const SITE_NAME = "US Political Alignment"
const REPO_URL = "https://github.com/jborgese/us-political-alignment"
const PARTY_LANE = "Parties abroad"
const ANCHOR_LANE = "Reference records"
const LONGEST_PARTY_LABEL = 12
const TICK_STEP = 25
const FLAGS: Record<string, string> = { Canada: "ca", France: "fr", Germany: "de", "United Kingdom": "uk" }

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
  kind: SiteKind
  detail: string
  lane: string
  score: number
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
  lanes: string[]
  records: SiteRecord[]
  selected: number
  heldBack: string[]
}

export interface SiteAssets {
  css: string
  js: string
}

export interface SitePage {
  head: string
  body: string
}

const initials = (name: string): string =>
  name
    .split(/[\s/]+/)
    .filter((word) => /^\p{Lu}/u.test(word))
    .map((word) => word[0])
    .join("")

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

const describeSubject = (subject: Subject): Pick<SiteRecord, "label" | "glyph" | "flag" | "detail" | "lane"> => {
  if (subject.kind === "caucus") {
    return { label: "", glyph: initials(subject.name), flag: null, detail: "House caucus", lane: subject.name }
  }
  if (subject.kind === "party") {
    const short = subject.name.length <= LONGEST_PARTY_LABEL ? subject.name : (subject.aliases[0] ?? subject.name)
    return {
      label: short,
      glyph: initials(subject.name),
      flag: FLAGS[subject.group] ?? null,
      detail: subject.group,
      lane: PARTY_LANE,
    }
  }
  const words = subject.name.split(" ")
  return {
    label: subject.aliases[0] ?? subject.name,
    glyph: initials(`${words[0]} ${words[words.length - 1]}`),
    flag: null,
    detail: subject.group,
    lane: subject.group,
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

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length

const laneOrder = (records: SiteRecord[]): string[] => {
  const lanes = records.map((record) => record.lane).filter((lane, index, all) => all.indexOf(lane) === index)
  const position = (lane: string): number => (lane === PARTY_LANE ? 0 : lane === ANCHOR_LANE ? 2 : 1)
  const average = (lane: string): number =>
    mean(records.filter((record) => record.lane === lane).map((record) => record.score))
  return lanes.toSorted((a, b) => position(a) - position(b) || average(b) - average(a))
}

const formatDay = (isoTime: string): string =>
  new Date(isoTime).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

export const buildSiteData = (set: RatingSet): SiteData => {
  const run = summarizeRun(set)
  if (!run.scaleIsValid) {
    throw new Error("The anchors did not come out in their intended order, so there is no valid scale to show.")
  }
  const packets = Object.fromEntries(ratedPackets(set).map((packet) => [packet.id, packet]))
  const scoreOf = (id: string): number => Math.round(run.scores[id]) || 0
  const rated = set.key.subjects.filter((subject) => subject.id in packets)
  const subjects: SiteRecord[] = rated
    .filter((subject) => !set.category.withheld.includes(subject.id))
    .map((subject) => ({
      name: subject.name,
      kind: subject.kind,
      ...describeSubject(subject),
      score: scoreOf(subject.id),
      sections: sectionsOf(set, packets[subject.id]),
    }))
  const anchors: SiteRecord[] = set.category.anchors.map((anchor) => {
    const name = capitalized(anchor.id.replace(/^anchor-/, ""))
    return {
      name,
      label: name,
      glyph: "",
      flag: null,
      kind: "anchor",
      detail: "Written reference record",
      lane: ANCHOR_LANE,
      score: scoreOf(anchor.id),
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
    lanes: laneOrder(records),
    records,
    selected: records.findIndex((record) => record.kind !== "anchor"),
    heldBack: rated.filter((subject) => set.category.withheld.includes(subject.id)).map((subject) => subject.name),
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (character) => ESCAPES[character])

const embedJson = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c")

const percent = (share: number): string => `${Math.round(share * 100)}%`

const icon = (name: string, className = "icon"): string =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"/></svg>`

const SYMBOLS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="i-official_act" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8.5 12.5l2.5 2.5 4.5-5.5"/></symbol>
<symbol id="i-influence" viewBox="0 0 24 24"><path d="M4 10v4h3l7 4V6l-7 4H4z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5"/></symbol>
<symbol id="i-statement" viewBox="0 0 24 24"><path d="M5 5h14v10h-8l-4 4v-4H5z"/></symbol>
<symbol id="i-none" viewBox="0 0 24 24"><path d="M7 12h10"/></symbol>
<symbol id="i-member" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></symbol>
<symbol id="i-caucus" viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3"/><path d="M3 19.5c.6-3 2.9-4.7 6-4.7s5.4 1.7 6 4.7"/><circle cx="17" cy="9.5" r="2.4"/><path d="M17 14.6c2.2.1 3.6 1.5 4 3.9"/></symbol>
<symbol id="i-party" viewBox="0 0 24 24"><path d="M6 21V4"/><path d="M6 5h11l-2 3.5 2 3.5H6"/></symbol>
<symbol id="i-anchor" viewBox="0 0 24 24"><path d="M12 4l8 8-8 8-8-8z"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-5.2"/></symbol>
<symbol id="i-orders" viewBox="0 0 24 24"><path d="M7 8h11l-3-3M17 16H6l3 3"/></symbol>
<symbol id="i-balance" viewBox="0 0 24 24"><path d="M12 5v14M7 19h10M5 8h14"/><path d="M5 8l-2.5 6h5zM19 8l-2.5 6h5z"/></symbol>
<symbol id="i-cut" viewBox="0 0 24 24"><circle cx="7" cy="7" r="2.5"/><circle cx="7" cy="17" r="2.5"/><path d="M9 8.5L20 17M9 15.5L20 7"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3.5l7 2.5v5.5c0 4.3-2.9 7.4-7 9-4.1-1.6-7-4.7-7-9V6z"/><path d="M12 9v6M9 12h6"/></symbol>
<symbol id="flag-fr" viewBox="0 0 24 24"><rect width="8" height="24" fill="#0055a4"/><rect x="8" width="8" height="24" fill="#ffffff"/><rect x="16" width="8" height="24" fill="#ef4135"/></symbol>
<symbol id="flag-de" viewBox="0 0 24 24"><rect width="24" height="8" fill="#000000"/><rect y="8" width="24" height="8" fill="#dd0000"/><rect y="16" width="24" height="8" fill="#ffce00"/></symbol>
<symbol id="flag-ca" viewBox="0 0 24 24"><rect width="24" height="24" fill="#ffffff"/><rect width="6" height="24" fill="#d52b1e"/><rect x="18" width="6" height="24" fill="#d52b1e"/><polygon fill="#d52b1e" points="12,5 13,7.4 14.6,6.6 14.1,10 16,8.6 16.5,9.9 18,9.6 17.2,12 18,12.6 14.8,15 15.2,16.3 12.5,15.9 12.5,19 11.5,19 11.5,15.9 8.8,16.3 9.2,15 6,12.6 6.8,12 6,9.6 7.5,9.9 8,8.6 9.9,10 9.4,6.6 11,7.4"/></symbol>
<symbol id="flag-uk" viewBox="0 0 24 24"><rect width="24" height="24" fill="#012169"/><path d="M0 0l24 24M24 0L0 24" stroke="#ffffff" stroke-width="4.8"/><path d="M0 0l24 24M24 0L0 24" stroke="#c8102e" stroke-width="1.8"/><path d="M12 0v24M0 12h24" stroke="#ffffff" stroke-width="7"/><path d="M12 0v24M0 12h24" stroke="#c8102e" stroke-width="4"/></symbol>
</defs></svg>`

const LANE_ICONS: Record<string, string> = { [PARTY_LANE]: "party", [ANCHOR_LANE]: "anchor" }

interface Axis {
  ticks: number[]
  position: (score: number) => string
}

const axisFor = (records: SiteRecord[]): Axis => {
  const scores = records.map((record) => record.score)
  const low = Math.min(0, Math.floor(Math.min(...scores) / TICK_STEP) * TICK_STEP)
  const high = Math.max(100, Math.ceil(Math.max(...scores) / TICK_STEP) * TICK_STEP)
  return {
    ticks: Array.from({ length: (high - low) / TICK_STEP + 1 }, (_, index) => low + index * TICK_STEP),
    position: (score) => (((score - low) / (high - low)) * 100).toFixed(2),
  }
}

const isAnchorTick = (tick: number): boolean => tick === 0 || tick === 100

const gridLines = (axis: Axis): string =>
  axis.ticks
    .map((tick) => `<span class="tick${isAnchorTick(tick) ? " anchor" : ""}" style="--x:${axis.position(tick)}"></span>`)
    .join("")

const tickLabels = (axis: Axis): string =>
  axis.ticks
    .map((tick) => {
      const kind = isAnchorTick(tick) ? "anchor" : tick === 50 ? "" : "minor"
      return `<span class="tick-label ${kind}" style="--x:${axis.position(tick)}">${tick}</span>`
    })
    .join("")

const glyph = (record: SiteRecord): string =>
  record.flag
    ? `<span class="glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#flag-${record.flag}"/></svg></span>`
    : `<span class="glyph">${escapeHtml(record.glyph)}</span>`

const marker = (record: SiteRecord, index: number, axis: Axis): string => {
  const x = axis.position(record.score)
  const label = record.label ? `<span class="name">${escapeHtml(record.label)}</span>` : ""
  return `<button type="button" class="marker" id="marker-${index}" data-index="${index}" data-kind="${record.kind}" data-x="${x}" style="--x:${x}" aria-pressed="false" aria-label="${escapeHtml(`${record.name}, ${record.score}`)}">${glyph(record)}${label}</button>`
}

const lane = (data: SiteData, name: string, axis: Axis): string => {
  const markers = data.records
    .map((record, index) => (record.lane === name ? marker(record, index, axis) : ""))
    .join("")
  return `<div class="lane"><div class="lane-label">${icon(LANE_ICONS[name] ?? "caucus")}${escapeHtml(name)}</div><div class="track">${gridLines(axis)}${markers}</div></div>`
}

const tableRows = (data: SiteData): string =>
  data.records
    .map((record) => {
      const rank = data.records.filter((other) => other.kind !== "anchor" && other.score > record.score).length + 1
      return `<tr><td class="num">${record.kind === "anchor" ? "" : rank}</td><td>${escapeHtml(record.name)}</td><td>${escapeHtml(record.detail)}</td><td class="num">${record.score}</td></tr>`
    })
    .join("")

const heldBack = (names: string[]): string =>
  names.length > 0
    ? `<p class="held-back">Held back until their evidence is stronger: ${escapeHtml(names.join(", "))}.</p>`
    : ""

export const buildSitePage = (data: SiteData, assets: SiteAssets): SitePage => {
  const axis = axisFor(data.records)
  return {
    head: [
      `<title>${SITE_NAME}</title>`,
      `<meta name="claude:viewport-fit-sides" content="cover">`,
      `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">`,
      `<style>${assets.css}</style>`,
    ].join("\n"),
    body: [
      SYMBOLS,
      `<main class="page">`,
      `<header class="masthead"><div class="site-name">${SITE_NAME} <span class="pilot">Pilot</span></div><h1>${escapeHtml(data.title)}</h1><p class="question">${escapeHtml(data.question)}</p></header>`,
      `<ul class="checks" aria-label="Checks on this run">`,
      `<li>${icon("check", "icon ok")}Reference records in order</li>`,
      `<li>${icon("orders")}<strong>${percent(data.agreementAcrossOrders)}</strong> same result in both orders</li>`,
      `<li>${icon("balance")}<strong>${percent(data.wonByFirstListed)}</strong> won by the record shown first</li>`,
      `</ul>`,
      `<section class="scale" aria-label="Records on one scale">`,
      `<ul class="key" aria-label="Marker shapes"><li><span class="glyph"></span>Member</li><li><span class="glyph caucus"></span>Caucus</li><li><span class="glyph anchor"></span>Reference record</li></ul>`,
      `<div class="axis"><div class="lane-label"></div><div class="track">${tickLabels(axis)}</div></div>`,
      ...data.lanes.map((name) => lane(data, name, axis)),
      `<div class="poles"><div><span class="pole low">${icon("cut")}${escapeHtml(capitalized(data.lowPole))}</span><span class="pole high">${icon("shield")}${escapeHtml(capitalized(data.highPole))}</span></div></div>`,
      `</section>`,
      heldBack(data.heldBack),
      `<section class="evidence" aria-live="polite" aria-label="Evidence for the selected record">`,
      `<div class="evidence-head" id="evidence-head"><span class="glyph" id="evidence-glyph"></span><div class="who"><h2 id="evidence-name"></h2><p id="evidence-detail"></p></div><div class="score"><b id="evidence-score"></b><span>on the 0 to 100 scale</span></div></div>`,
      `<ul class="tier-key" aria-label="Kinds of evidence"><li>${icon("official_act")}Official act</li><li>${icon("influence")}Influence</li><li>${icon("statement")}Statement</li></ul>`,
      `<div class="sections" id="evidence-sections"></div>`,
      `</section>`,
      `<details class="table"><summary>All records as a table</summary><div class="table-scroll"><table><thead><tr><th class="num">Rank</th><th>Record</th><th>Group</th><th class="num">Score</th></tr></thead><tbody>${tableRows(data)}</tbody></table></div></details>`,
      `<footer><span>${data.comparisons} blinded comparisons, rated by ${escapeHtml(data.model)} on ${escapeHtml(data.ratedOn)}</span><a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">Method and data</a></footer>`,
      `</main>`,
      `<div class="tooltip" id="tooltip" hidden></div>`,
      `<script type="application/json" id="site-data">${embedJson(data)}</script>`,
      `<script>${assets.js}</script>`,
    ].join("\n"),
  }
}

const asDocument = ({ head, body }: SitePage): string =>
  [
    "<!doctype html>",
    `<html lang="en">`,
    "<head>",
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    head,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n")

const readAsset = (name: string): Promise<string> => readFile(new URL(`../site/${name}`, import.meta.url), "utf8")

export const writeSite = async (root: string, categoryId: string): Promise<string> => {
  const [set, css, js] = await Promise.all([loadRatingSet(root, categoryId), readAsset("style.css"), readAsset("app.js")])
  const file = path.join(root, "dist", "index.html")
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, asDocument(buildSitePage(buildSiteData(set), { css, js })))
  return file
}
