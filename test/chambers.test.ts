import { describe, expect, it } from "vitest"

import { angleBetween, chamberView, hemicycle, type SiteChamber, type SiteSeat } from "../src/chambers.ts"

describe("hemicycle", () => {
  it("places every seat once, from the left end of the arc to the right", () => {
    const { seats } = hemicycle(435)

    expect(seats).toHaveLength(435)
    expect(seats[0].angle).toBeCloseTo(Math.PI)
    expect(seats.at(-1)?.angle).toBeCloseTo(0)
    expect(seats.every((seat, index) => index === 0 || seats[index - 1].angle >= seat.angle)).toBe(true)
  })

  it("keeps seats from touching in a chamber of 100 or of 435", () => {
    const closest = (count: number): number => {
      const { seats, seatRadius } = hemicycle(count)
      const gaps = seats.flatMap((seat, index) =>
        seats.slice(index + 1).map((other) => Math.hypot(seat.x - other.x, seat.y - other.y)),
      )
      return Math.min(...gaps) / (2 * seatRadius)
    }

    expect(closest(100)).toBeGreaterThan(1)
    expect(closest(435)).toBeGreaterThan(1)
  })

  it("draws nothing for an empty chamber", () => {
    expect(hemicycle(0)).toEqual({ seats: [], seatRadius: 0 })
  })
})

describe("angleBetween", () => {
  it("falls between the last seat before it and the first after, or at an end", () => {
    const { seats } = hemicycle(10)

    expect(angleBetween(seats, 0)).toBe(Math.PI)
    expect(angleBetween(seats, 10)).toBe(0)
    expect(angleBetween(seats, 4)).toBeCloseTo((seats[3].angle + seats[4].angle) / 2)
  })
})

describe("chamberView", () => {
  const seat = (name: string, party: string, leftRight: number | null, extra: Partial<SiteSeat> = {}): SiteSeat => ({
    name,
    party,
    caucusesWith: null,
    role: null,
    index: 0,
    leftRight,
    note: null,
    ...extra,
  })
  const chamber: SiteChamber = {
    id: "us-senate",
    label: "Senate",
    seats: 100,
    placed: [
      seat("Ann Left", "Democratic", 90),
      seat("Ira Middle", "Independent", 60, { caucusesWith: "Democratic" }),
      seat("Bob Right", "Republican", 10),
    ],
    unplaced: [
      seat("Cy New", "Republican", null, { index: null, note: "Member-elect: placed once they have a voting record" }),
    ],
  }
  const view = chamberView(chamber, 1, "the average score on issue B")
  const seatTags = [...view.matchAll(/<circle class="seat"[^>]*>/g)].map((match) => match[0])
  const attribute = (tag: string, name: string): string | undefined => tag.match(new RegExp(`${name}="([^"]+)"`))?.[1]
  const arcLabels = (markup: string): string[] =>
    [...markup.matchAll(/class="arc-label"[^>]*>([^<]+)</g)].map((match) => match[1])

  it("draws one seat per placed member from left to right, coloured by party, with an independent's caucus as a core inside the seat", () => {
    const cores = [...view.matchAll(/<circle class="caucus-core"[^>]*>/g)].map((match) => match[0])

    expect(seatTags.map((tag) => attribute(tag, "data-party"))).toEqual(["democratic", "independent", "republican"])
    expect(cores.map((core) => [attribute(core, "cx"), attribute(core, "data-caucus")])).toEqual([
      [attribute(seatTags[1], "cx"), "democratic"],
    ])
    expect(Number(attribute(cores[0], "r"))).toBeLessThan(Number(attribute(seatTags[1], "r")))
    expect(Number(attribute(seatTags[0], "cx"))).toBeLessThan(Number(attribute(seatTags[2], "cx")))
  })

  it("counts placed members against the chamber's size and lists the rest below as slashed seats with the reason", () => {
    expect(view).toContain("<b>3</b> of 100 members placed")
    expect(view).toContain('aria-label="Cy New, Republican: Member-elect: placed once they have a voting record"')
    expect(view).toContain('<span class="dot slashed" data-party="republican"></span>')
  })

  it("marks where 75, 50 and 25 fall on the arc", () => {
    const spread = [
      seat("Ann Left", "Democratic", 90),
      seat("Ira Middle", "Independent", 60),
      seat("Dee Centre", "Republican", 40),
      seat("Bob Right", "Republican", 10),
    ]

    expect(arcLabels(chamberView({ ...chamber, placed: spread }, 0, "issue B"))).toEqual(["75", "50", "25"])
  })

  it("merges ticks that fall at the same place", () => {
    expect(arcLabels(view)).toEqual(["75", "50, 25"])
  })

  it("rings a party leader's seat outside in its party colour and adds the leader to the key", () => {
    const led = chamberView(
      { ...chamber, placed: [seat("Ann Left", "Democratic", 90, { role: "Minority Leader" })], unplaced: [] },
      0,
      "issue B",
    )
    const ring = led.match(/<circle class="leader-ring"[^>]*>/)?.[0] ?? ""
    const leaderSeat = led.match(/<circle class="seat"[^>]*>/)?.[0] ?? ""

    expect(Number(attribute(ring, "r"))).toBeGreaterThan(Number(attribute(leaderSeat, "r")))
    expect(attribute(ring, "data-party")).toBe("democratic")
    expect(led).toContain("Party leader</li>")
    expect(view).not.toContain("leader-ring")
  })

  it("offers every member's name to the search", () => {
    expect([...view.matchAll(/<option value="([^"]+)">/g)].map((match) => match[1])).toEqual([
      "Ann Left",
      "Bob Right",
      "Cy New",
      "Ira Middle",
    ])
  })
})
