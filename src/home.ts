import type { PlannedCategory } from "./files.ts"
import {
  REPO_URL,
  SITE_NAME,
  SYMBOLS,
  UNPUBLISHED,
  axisFor,
  escapeHtml,
  glyph,
  gridLines,
  icon,
  pageHead,
  partyKey,
  tickLabels,
  usPartyKey,
  type Axis,
  type Emblem,
  type SiteAssets,
  type SitePage,
} from "./markup.ts"
import type { SiteData, SiteRecord } from "./site.ts"

export type HomeRecord = Pick<SiteRecord, "name" | "kind" | "party" | "symbol" | "flag" | "glyph" | "detail" | "score">

export interface HomeIssue {
  id: string
  label: string
  href: string | null
  records: HomeRecord[]
}

export interface HomeData {
  issues: HomeIssue[]
}

export const buildHomeData = (
  planned: Pick<PlannedCategory, "id" | "label">[],
  published: Record<string, SiteData>,
): HomeData => ({
  issues: planned.map(({ id, label }) => ({
    id,
    label,
    href: id in published ? `${id}/` : null,
    records: (published[id]?.records ?? [])
      .filter((record) => record.kind !== "anchor")
      .map(({ name, kind, party, symbol, flag, glyph: initials, detail, score }) => ({
        name,
        kind,
        party,
        symbol,
        flag,
        glyph: initials,
        detail,
        score,
      })),
  })),
})

const HERO_STEPS = [
  { icon: "record", title: "The record", text: "What each one did, pushed for and said, with sources" },
  { icon: "hidden", title: "Names hidden", text: "A language model compares two records at a time, without names or parties" },
  { icon: "scale", title: "A score per issue", text: "Who wins each pair sets the score, from 0 to 100" },
]

const shownOnce = (values: (string | null)[]): string[] => [...new Set(values.flatMap((value) => value ?? []))].toSorted()

const emblems = (wrapper: (value: string) => string, records: Emblem[]): string =>
  `<span class="emblems">${records.map((record) => `<span ${wrapper(record.flag ?? record.symbol ?? "")}>${glyph(record)}</span>`).join("")}</span>`

const hero = (records: HomeRecord[]): string =>
  [
    `<section class="hero" aria-labelledby="hero-title">`,
    `<h1 id="hero-title">How do US House members compare with parties abroad?</h1>`,
    `<p class="hero-lead">Placed by their record, not their party label, on one scale per issue.</p>`,
    `<ul class="hero-who" aria-label="Who is compared">`,
    `<li>${emblems((symbol) => `data-symbol="${symbol}"`, shownOnce(records.map((record) => record.symbol)).map((symbol) => ({ glyph: "", flag: null, symbol })))}${usPartyKey(records) ? "US parties, House members and caucuses" : "House members and caucuses"}</li>`,
    `<li>${emblems(() => `data-kind="party"`, shownOnce(records.map((record) => record.flag)).map((flag) => ({ glyph: "", flag, symbol: null })))}Parties abroad</li>`,
    `</ul>`,
    `<ol class="hero-steps">${HERO_STEPS.map(({ icon: name, title, text }) => `<li>${icon(name)}<b>${title}</b><span>${text}</span></li>`).join("")}</ol>`,
    `</section>`,
  ].join("\n")

const mark = (record: HomeRecord, axis: Axis): string => {
  const symbol = record.symbol ? ` data-symbol="${record.symbol}"` : ""
  return `<span class="marker" data-kind="${record.kind}"${symbol} data-name="${escapeHtml(record.name)}" data-score="${record.score}" style="--y:${axis.position(record.score)}">${glyph(record)}</span>`
}

const column = (issue: HomeIssue, axis: Axis): string => {
  if (issue.href === null) return `<div class="column unpublished">${gridLines(axis)}</div>`
  const label = `${issue.label}: ${issue.records.length} records. Open its chart.`
  return `<a class="column" href="${escapeHtml(issue.href)}" aria-label="${escapeHtml(label)}">${gridLines(axis)}${issue.records.map((record) => mark(record, axis)).join("")}</a>`
}

const columnHead = (issue: HomeIssue): string => {
  const content = `${icon(`issue-${issue.id}`)}<span class="full">${escapeHtml(issue.label)}</span>`
  return issue.href === null
    ? `<div class="column-head unpublished" title="${escapeHtml(`${issue.label}: ${UNPUBLISHED.toLowerCase()}`)}">${content}</div>`
    : `<a class="column-head" href="${escapeHtml(issue.href)}" title="${escapeHtml(issue.label)}">${content}</a>`
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length

const tableRows = (published: HomeIssue[]): string => {
  const records = published.flatMap((issue) => issue.records)
  const scoresOf = (name: string): (number | undefined)[] =>
    published.map((issue) => issue.records.find((record) => record.name === name)?.score)
  return records
    .filter((record, index) => records.findIndex((other) => other.name === record.name) === index)
    .map((record) => ({ record, scores: scoresOf(record.name) }))
    .toSorted((a, b) => mean(b.scores.flatMap((score) => score ?? [])) - mean(a.scores.flatMap((score) => score ?? [])))
    .map(
      ({ record, scores }) =>
        `<tr><td>${escapeHtml(record.name)}</td><td>${escapeHtml(record.detail)}</td>${scores.map((score) => `<td class="num">${score ?? ""}</td>`).join("")}</tr>`,
    )
    .join("")
}

export const buildHomePage = ({ issues }: HomeData, assets: SiteAssets): SitePage => {
  const published = issues.filter((issue) => issue.href !== null)
  const records = published.flatMap((issue) => issue.records)
  const axis = axisFor(records.map((record) => record.score))
  return {
    head: pageHead(assets.css),
    body: [
      SYMBOLS,
      `<main class="page">`,
      `<header class="masthead"><div class="site-name">${SITE_NAME} <span class="pilot">Pilot</span></div></header>`,
      hero(records),
      `<div class="section-head"><h2>Support by issue</h2><p class="question">One column per issue. Higher is stronger support for the position at the top of that issue's scale.</p></div>`,
      `<section class="scale" aria-label="Scores by issue">`,
      `<ul class="key" aria-label="Marker key">${partyKey(records)}<li><span class="glyph"></span>Member</li><li><span class="glyph caucus"></span>Caucus</li>${usPartyKey(records)}<li class="unpublished">${icon("none")}${UNPUBLISHED}</li></ul>`,
      `<div class="plot overview" style="--columns:${issues.length}">`,
      `<div class="y-axis">${tickLabels(axis)}</div>`,
      ...issues.map((issue) => column(issue, axis)),
      `<div></div>`,
      ...issues.map(columnHead),
      `</div>`,
      `</section>`,
      `<details class="table"><summary>All scores as a table</summary><div class="table-scroll"><table><thead><tr><th>Record</th><th>Group</th>${published.map((issue) => `<th class="num">${escapeHtml(issue.label)}</th>`).join("")}</tr></thead><tbody>${tableRows(published)}</tbody></table></div></details>`,
      `<footer><span>Blinded pairwise comparisons, one scale per issue</span><a href="${REPO_URL}" target="_blank" rel="noopener noreferrer">Method and data</a></footer>`,
      `</main>`,
      `<div class="tooltip" id="tooltip" hidden></div>`,
      `<script>${assets.js}</script>`,
    ].join("\n"),
  }
}
