import { escapeHtml, icon } from "./markup.ts"

export const INNER_RADIUS = 0.4
const SEAT_SHARE_OF_PITCH = 0.4
const VIEW = { left: -1.2, top: -1.3, width: 2.4, height: 1.42 }
const LEFT_RIGHT_TICKS = [75, 50, 25]
const TICK_GAP = 0.03
const TICK_LENGTH = 0.05
const LABEL_GAP = 0.07

export interface SiteSeat {
  name: string
  party: string | null
  caucusesWith: string | null
  role: string | null
  index: number | null
  leftRight: number | null
  note: string | null
}

export interface SiteChamber {
  id: string
  label: string
  seats: number
  placed: SiteSeat[]
  unplaced: SiteSeat[]
}

export interface Seat {
  x: number
  y: number
  angle: number
  ring: number
}

export interface Hemicycle {
  seats: Seat[]
  seatRadius: number
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0)

const ringRadii = (rings: number): number[] =>
  rings === 1
    ? [1]
    : Array.from({ length: rings }, (_, ring) => INNER_RADIUS + ((1 - INNER_RADIUS) * ring) / (rings - 1))

const pitchFor = (rings: number): number => (1 - INNER_RADIUS) / Math.max(rings - 1, 1)

const capacity = (rings: number): number =>
  sum(ringRadii(rings).map((radius) => Math.floor((Math.PI * radius) / pitchFor(rings)) + 1))

const ringsFor = (count: number, rings = 1): number => (capacity(rings) >= count ? rings : ringsFor(count, rings + 1))

const sharesOf = (count: number, weights: number[]): number[] => {
  const exact = weights.map((weight) => (count * weight) / sum(weights))
  const floors = exact.map(Math.floor)
  const extra = exact
    .map((value, ring) => ({ ring, rest: value - floors[ring] }))
    .toSorted((a, b) => b.rest - a.rest || b.ring - a.ring)
    .slice(0, count - sum(floors))
    .map(({ ring }) => ring)
  return floors.map((floor, ring) => floor + (extra.includes(ring) ? 1 : 0))
}

const ringSeats = (radius: number, ring: number, count: number): Seat[] =>
  Array.from({ length: count }, (_, position) => {
    const angle = count === 1 ? Math.PI / 2 : Math.PI - (Math.PI * position) / (count - 1)
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), angle, ring }
  })

export const hemicycle = (count: number): Hemicycle => {
  if (count === 0) return { seats: [], seatRadius: 0 }
  const rings = ringsFor(count)
  const radii = ringRadii(rings)
  const seats = sharesOf(count, radii)
    .flatMap((seatsInRing, ring) => ringSeats(radii[ring], ring, seatsInRing))
    .toSorted((a, b) => b.angle - a.angle || a.ring - b.ring)
  return { seats, seatRadius: pitchFor(rings) * SEAT_SHARE_OF_PITCH }
}

export const angleBetween = (seats: Seat[], seatsBefore: number): number => {
  if (seatsBefore <= 0 || seats.length === 0) return Math.PI
  if (seatsBefore >= seats.length) return 0
  return (seats[seatsBefore - 1].angle + seats[seatsBefore].angle) / 2
}

const slug = (text: string | null): string => (text ?? "none").toLowerCase().replace(/[^a-z]+/g, "-")

const partyAttributes = ({ party, caucusesWith }: SiteSeat): string =>
  ` data-party="${slug(party)}"${caucusesWith ? ` data-caucus="${slug(caucusesWith)}"` : ""}`

const fixed = (value: number): string => value.toFixed(4)

const placedAt = (radius: number, angle: number): string => {
  const left = ((radius * Math.cos(angle) - VIEW.left) / VIEW.width) * 100
  const top = ((-radius * Math.sin(angle) - VIEW.top) / VIEW.height) * 100
  return `left:${left.toFixed(2)}%;top:${top.toFixed(2)}%`
}

const LEADER_RING_SHARE = 1.3

const seatCircle =
  (chamberIndex: number, layout: Hemicycle) =>
  (seat: SiteSeat, position: number): string => {
    const { x, y } = layout.seats[position]
    const centre = `cx="${fixed(x)}" cy="${fixed(-y)}"`
    const leaderRing = seat.role
      ? `<circle class="leader-ring" ${centre} r="${fixed(layout.seatRadius * LEADER_RING_SHARE)}"${partyAttributes(seat)}/>`
      : ""
    return `<circle class="seat" ${centre} r="${fixed(layout.seatRadius)}" data-chamber="${chamberIndex}" data-list="placed" data-seat="${position}"${partyAttributes(seat)}/>${leaderRing}`
  }

interface ArcTick {
  values: number[]
  angle: number
}

const withSameAngleMerged = (merged: ArcTick[], tick: ArcTick): ArcTick[] => {
  const last = merged.at(-1)
  return last?.angle === tick.angle
    ? [...merged.slice(0, -1), { ...last, values: [...last.values, ...tick.values] }]
    : [...merged, tick]
}

const arcTicks = (placed: SiteSeat[], layout: Hemicycle): { lines: string; labels: string } => {
  const inner = 1 + layout.seatRadius + TICK_GAP
  const outer = inner + TICK_LENGTH
  const ticks = LEFT_RIGHT_TICKS.map((value) => ({
    values: [value],
    angle: angleBetween(layout.seats, placed.filter((seat) => (seat.leftRight ?? 0) >= value).length),
  })).reduce(withSameAngleMerged, [])
  return {
    lines: ticks
      .map(
        ({ angle }) =>
          `<line x1="${fixed(inner * Math.cos(angle))}" y1="${fixed(-inner * Math.sin(angle))}" x2="${fixed(outer * Math.cos(angle))}" y2="${fixed(-outer * Math.sin(angle))}"/>`,
      )
      .join(""),
    labels: ticks
      .map(({ values, angle }) => `<span class="arc-label" style="${placedAt(outer + LABEL_GAP, angle)}">${values.join(", ")}</span>`)
      .join(""),
  }
}

const partyName = ({ party, caucusesWith }: SiteSeat): string =>
  `${party ?? "No party"}${caucusesWith ? ` (${caucusesWith} caucus)` : ""}`

const describedSeat = (seat: SiteSeat): string => `${seat.name}, ${partyName(seat)}${seat.role ? `, ${seat.role}` : ""}`

const leaderClass = (seat: SiteSeat): string => (seat.role ? " party-leader" : "")

const seatKey = (chamber: SiteChamber): string =>
  [
    ...[...chamber.placed, ...chamber.unplaced]
      .filter(
        (seat, index, all) =>
          all.findIndex((other) => other.party === seat.party && other.caucusesWith === seat.caucusesWith) === index,
      )
      .toSorted((a, b) => partyName(a).localeCompare(partyName(b)))
      .map((seat) => `<li><span class="dot"${partyAttributes(seat)}></span>${escapeHtml(partyName(seat))}</li>`),
    ...([...chamber.placed, ...chamber.unplaced].some((seat) => seat.role)
      ? [`<li><span class="dot party-leader"></span>Party leader</li>`]
      : []),
    ...(chamber.unplaced.length > 0 ? [`<li><span class="dot slashed"></span>Not enough data to place</li>`] : []),
  ].join("")

const memberSearch = (chamber: SiteChamber, chamberIndex: number): string => {
  const names = [...chamber.placed, ...chamber.unplaced].map((seat) => seat.name).toSorted((a, b) => a.localeCompare(b))
  return [
    `<div class="member-search">`,
    `<label for="find-${chamber.id}">${icon("search")}<span>Find a member</span></label>`,
    `<input type="search" id="find-${chamber.id}" list="members-${chamber.id}" data-chamber="${chamberIndex}" autocomplete="off" placeholder="Name">`,
    `<datalist id="members-${chamber.id}">${names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>`,
    `</div>`,
  ].join("")
}

const unplacedSeats = (chamber: SiteChamber, chamberIndex: number): string =>
  chamber.unplaced.length === 0
    ? ""
    : [
        `<div class="unplaced">`,
        `<p class="unplaced-head"><span class="dot slashed" aria-hidden="true"></span>Not enough data to place <b>${chamber.unplaced.length}</b></p>`,
        `<ul class="unplaced-seats">`,
        ...chamber.unplaced.map(
          (seat, position) =>
            `<li><button type="button" class="unplaced-seat" data-chamber="${chamberIndex}" data-list="unplaced" data-seat="${position}" aria-label="${escapeHtml(`${describedSeat(seat)}: ${seat.note ?? "not placed"}`)}"><span class="dot slashed${leaderClass(seat)}"${partyAttributes(seat)}></span></button></li>`,
        ),
        `</ul>`,
        `</div>`,
      ].join("")

export const chamberView = (chamber: SiteChamber, chamberIndex: number, basis: string): string => {
  const layout = hemicycle(chamber.placed.length)
  const ticks = chamber.placed.length > 0 ? arcTicks(chamber.placed, layout) : { lines: "", labels: "" }
  const summary = `${chamber.label}: ${chamber.placed.length} of ${chamber.seats} members placed, ordered from left to right. Use the search to find a member.`
  return [
    `<div class="chamber" data-chamber="${chamberIndex}" style="--dot:${chamber.seats > 150 ? 10 : 16}px">`,
    `<div class="chamber-head"><p class="chamber-count"><b>${chamber.placed.length}</b> of ${chamber.seats} members placed</p>${memberSearch(chamber, chamberIndex)}</div>`,
    `<p class="chamber-status" data-chamber="${chamberIndex}" aria-live="polite"></p>`,
    `<ul class="key chamber-key" aria-label="Seat key">${seatKey(chamber)}</ul>`,
    `<div class="hemicycle-frame">`,
    `<svg class="hemicycle" viewBox="${VIEW.left} ${VIEW.top} ${VIEW.width} ${VIEW.height}" role="img" aria-label="${escapeHtml(summary)}" style="--gap:${fixed(layout.seatRadius * 0.2)};--ring:${fixed(layout.seatRadius * 0.4)}">`,
    `<g class="arc-ticks">${ticks.lines}</g>`,
    `<g class="seats">${chamber.placed.map(seatCircle(chamberIndex, layout)).join("")}</g>`,
    `</svg>`,
    ticks.labels,
    `</div>`,
    `<div class="chamber-poles"><span>${icon("arrow-left")}Left</span><span>Right${icon("arrow-right")}</span></div>`,
    `<p class="scale-note">${icon("move")}${escapeHtml(`Seats run from left to right by ${basis}. They show order, not distance: ticks on the arc mark where ${LEFT_RIGHT_TICKS.slice(0, -1).join(", ")} and ${LEFT_RIGHT_TICKS.at(-1)} fall.`)}</p>`,
    unplacedSeats(chamber, chamberIndex),
    `</div>`,
  ].join("")
}
