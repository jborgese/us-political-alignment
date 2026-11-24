export const SITE_NAME = "US Political Alignment"
export const REPO_URL = "https://github.com/jborgese/us-political-alignment"
export const UNPUBLISHED = "Not yet published"
const TICK_STEP = 25

export interface SiteAssets {
  css: string
  js: string
}

export interface SitePage {
  head: string
  body: string
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }

export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (character) => ESCAPES[character])

export const embedJson = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c")

export const icon = (name: string, className = "icon"): string =>
  `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"/></svg>`

export const SYMBOLS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
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
<symbol id="i-move" viewBox="0 0 24 24"><path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/></symbol>
<symbol id="i-reword" viewBox="0 0 24 24"><path d="M4 7h10M4 12h6M4 17h4"/><path d="M19.5 14.5a4 4 0 1 1-1.2-4.3"/><path d="M19.6 7.6v3h-3"/></symbol>
<symbol id="i-cut" viewBox="0 0 24 24"><circle cx="7" cy="7" r="2.5"/><circle cx="7" cy="17" r="2.5"/><path d="M9 8.5L20 17M9 15.5L20 7"/></symbol>
<symbol id="i-record" viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/></symbol>
<symbol id="i-hidden" viewBox="0 0 24 24"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/><path d="M4.5 19.5l15-15"/></symbol>
<symbol id="i-scale" viewBox="0 0 24 24"><path d="M8 3v18M8 4h3M8 8h2M8 12h3M8 16h2M8 20h3"/><circle cx="16" cy="9" r="2.5"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3.5l7 2.5v5.5c0 4.3-2.9 7.4-7 9-4.1-1.6-7-4.7-7-9V6z"/><path d="M12 9v6M9 12h6"/></symbol>
<symbol id="i-issue-welfare-health" viewBox="0 0 24 24"><path d="M12 3.5l7 2.5v5.5c0 4.3-2.9 7.4-7 9-4.1-1.6-7-4.7-7-9V6z"/><path d="M12 9v6M9 12h6"/></symbol>
<symbol id="i-issue-economics" viewBox="0 0 24 24"><path d="M4 20h16M7 20v-6M12 20V8M17 20v-9"/></symbol>
<symbol id="i-issue-immigration" viewBox="0 0 24 24"><path d="M9 3v18" stroke-dasharray="3 3"/><path d="M3 12h16M15 8l4 4-4 4"/></symbol>
<symbol id="i-issue-social-cultural" viewBox="0 0 24 24"><circle cx="9" cy="10" r="5.5"/><circle cx="15" cy="14" r="5.5"/></symbol>
<symbol id="i-issue-environment" viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14z"/><path d="M5 19c3-4 6-6.5 10-9"/></symbol>
<symbol id="i-issue-democratic-norms" viewBox="0 0 24 24"><path d="M4 9l8-5 8 5M5 9h14M7 9v8M12 9v8M17 9v8M5 17h14M4 20h16"/></symbol>
<symbol id="party-donkey" viewBox="0 0 24 24"><rect x="8.5" y="10" width="12" height="6" rx="2.6"/><path d="M10.5 10.6L7.6 6.4 3.4 9.6c-.5.4-.5 1.1 0 1.5l.6.5c.4.3.9.3 1.3.1L7.8 10l1.6 4z"/><path d="M7.2 7.2L6.3 2.4l2.3 3.4z"/><path d="M8.6 6.6l.8-4.2 1 4.6z"/><rect x="9.4" y="14.5" width="2" height="6.2" rx=".8"/><rect x="12.2" y="14.5" width="2" height="6.2" rx=".8"/><rect x="15.6" y="14.5" width="2" height="6.2" rx=".8"/><rect x="18.4" y="14.5" width="2" height="6.2" rx=".8"/><path d="M20.2 11l1.8 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="6.2" cy="8.8" r=".6" fill="var(--symbol-detail)"/></symbol>
<symbol id="party-elephant" viewBox="0 0 24 24"><rect x="7.5" y="7" width="13.5" height="9" rx="4.2"/><circle cx="7.6" cy="10" r="4.4"/><path d="M4.4 10.5v6.3a1.5 1.5 0 0 0 3 0" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><rect x="9.6" y="14" width="3.2" height="6.2" rx="1"/><rect x="16.6" y="14" width="3.2" height="6.2" rx="1"/><path d="M9.2 7.4a3.4 3.4 0 0 1 0 5.6" fill="none" stroke="var(--symbol-detail)" stroke-width="1.1" stroke-linecap="round"/><path d="M21 9.5l1.4 3" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><circle cx="6" cy="9" r=".7" fill="var(--symbol-detail)"/></symbol>
<symbol id="flag-fr" viewBox="0 0 24 24"><rect width="8" height="24" fill="#0055a4"/><rect x="8" width="8" height="24" fill="#ffffff"/><rect x="16" width="8" height="24" fill="#ef4135"/></symbol>
<symbol id="flag-de" viewBox="0 0 24 24"><rect width="24" height="8" fill="#000000"/><rect y="8" width="24" height="8" fill="#dd0000"/><rect y="16" width="24" height="8" fill="#ffce00"/></symbol>
<symbol id="flag-ca" viewBox="0 0 24 24"><rect width="24" height="24" fill="#ffffff"/><rect width="6" height="24" fill="#d52b1e"/><rect x="18" width="6" height="24" fill="#d52b1e"/><polygon fill="#d52b1e" points="12,5 13,7.4 14.6,6.6 14.1,10 16,8.6 16.5,9.9 18,9.6 17.2,12 18,12.6 14.8,15 15.2,16.3 12.5,15.9 12.5,19 11.5,19 11.5,15.9 8.8,16.3 9.2,15 6,12.6 6.8,12 6,9.6 7.5,9.9 8,8.6 9.9,10 9.4,6.6 11,7.4"/></symbol>
<symbol id="flag-uk" viewBox="0 0 24 24"><rect width="24" height="24" fill="#012169"/><path d="M0 0l24 24M24 0L0 24" stroke="#ffffff" stroke-width="4.8"/><path d="M0 0l24 24M24 0L0 24" stroke="#c8102e" stroke-width="1.8"/><path d="M12 0v24M0 12h24" stroke="#ffffff" stroke-width="7"/><path d="M12 0v24M0 12h24" stroke="#c8102e" stroke-width="4"/></symbol>
</defs></svg>`

export interface Axis {
  ticks: number[]
  position: (score: number) => string
  length: (points: number) => string
}

export const axisFor = (scores: number[]): Axis => {
  const low = Math.min(0, Math.floor(Math.min(...scores) / TICK_STEP) * TICK_STEP)
  const high = Math.max(100, Math.ceil(Math.max(...scores) / TICK_STEP) * TICK_STEP)
  return {
    ticks: Array.from({ length: (high - low) / TICK_STEP + 1 }, (_, index) => high - index * TICK_STEP),
    position: (score) => (((high - score) / (high - low)) * 100).toFixed(2),
    length: (points) => ((points / (high - low)) * 100).toFixed(2),
  }
}

const isAnchorTick = (tick: number): boolean => tick === 0 || tick === 100

export const gridLines = (axis: Axis): string =>
  axis.ticks
    .map((tick) => `<span class="tick${isAnchorTick(tick) ? " anchor" : ""}" style="--y:${axis.position(tick)}"></span>`)
    .join("")

export const tickLabels = (axis: Axis): string =>
  axis.ticks
    .map(
      (tick) =>
        `<span class="tick-label${isAnchorTick(tick) ? " anchor" : ""}" style="--y:${axis.position(tick)}">${tick}</span>`,
    )
    .join("")

const partySymbol = (symbol: string): string =>
  `<svg class="party-symbol" viewBox="0 0 24 24" aria-hidden="true"><use href="#party-${symbol}"/></svg>`

export interface Emblem {
  glyph: string
  flag: string | null
  symbol: string | null
}

export const glyph = (record: Emblem): string => {
  if (record.flag) {
    return `<span class="glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#flag-${record.flag}"/></svg></span>`
  }
  return `<span class="glyph">${record.symbol ? partySymbol(record.symbol) : escapeHtml(record.glyph)}</span>`
}

export const partyKey = (records: { party: string | null; symbol: string | null }[]): string =>
  records
    .filter((record) => record.symbol && record.party)
    .filter((record, index, all) => all.findIndex((other) => other.symbol === record.symbol) === index)
    .toSorted((a, b) => (a.party ?? "").localeCompare(b.party ?? ""))
    .map(
      (record) =>
        `<li><span class="glyph" data-symbol="${record.symbol}">${partySymbol(record.symbol ?? "")}</span>${escapeHtml(record.party ?? "")}</li>`,
    )
    .join("")

export const usPartyKey = (records: { kind: string; symbol: string | null }[]): string =>
  records.some((record) => record.kind === "party" && record.symbol)
    ? `<li><span class="glyph us-party"></span>US party</li>`
    : ""

export const pageHead = (css: string): string =>
  [
    `<title>${SITE_NAME}</title>`,
    `<meta name="claude:viewport-fit-sides" content="cover">`,
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">`,
    `<style>${css}</style>`,
  ].join("\n")

export const asDocument = ({ head, body }: SitePage): string =>
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
