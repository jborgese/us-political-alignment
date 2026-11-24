import { describe, expect, it } from "vitest"

import { buildHomeData, buildHomePage } from "../src/home.ts"
import type { SiteData, SiteRecord } from "../src/site.ts"

const record = (name: string, kind: SiteRecord["kind"], score: number, extra: Partial<SiteRecord> = {}): SiteRecord => ({
  name,
  label: name,
  glyph: "",
  flag: null,
  party: null,
  symbol: null,
  kind,
  detail: "Sample Caucus",
  group: "Sample Caucus",
  legislature: "sample-house",
  score,
  previousScore: null,
  range: null,
  sections: [],
  ...extra,
})

const siteData = (records: SiteRecord[]): SiteData => ({
  title: "Sample issue",
  question: "Which record shows more support?",
  highPole: "more support",
  lowPole: "less support",
  model: "model-a",
  comparisons: 20,
  ratedOn: "22 November 2026",
  agreementAcrossOrders: 1,
  wonByFirstListed: 0.5,
  groups: [],
  records,
  selected: 1,
  heldBack: [],
  systems: null,
})

const PLANNED = [
  { id: "welfare-health", label: "Welfare and health" },
  { id: "economics", label: "Economics" },
  { id: "immigration", label: "Immigration" },
]

const welfare = siteData([
  record("High", "anchor", 100),
  record("Jane Sample", "member", 70, { party: "Democratic", symbol: "donkey" }),
  record("Sample Caucus", "caucus", 40, { party: "Republican", symbol: "elephant" }),
  record("Low", "anchor", 0),
])
const economics = siteData([
  record("High", "anchor", 100),
  record("Jane Sample", "member", 30, { party: "Democratic", symbol: "donkey" }),
  record("Low", "anchor", 0),
])

const page = (published: Record<string, SiteData>): string =>
  buildHomePage(buildHomeData(PLANNED, published), { css: "", js: "" }).body

describe("buildHomeData", () => {
  it("links each published issue, leaves the others unlinked, and keeps the planned order", () => {
    const { issues } = buildHomeData(PLANNED, { "welfare-health": welfare })

    expect(issues.map(({ id, href }) => ({ id, href }))).toEqual([
      { id: "welfare-health", href: "welfare-health/" },
      { id: "economics", href: null },
      { id: "immigration", href: null },
    ])
  })

  it("carries the subjects of a published issue and leaves its reference records out", () => {
    const [published, unpublished] = buildHomeData(PLANNED, { "welfare-health": welfare }).issues

    expect(published.records.map(({ name, score }) => ({ name, score }))).toEqual([
      { name: "Jane Sample", score: 70 },
      { name: "Sample Caucus", score: 40 },
    ])
    expect(unpublished.records).toEqual([])
  })
})

describe("buildHomePage", () => {
  it("draws a linked column of marks for a published issue and an empty one for the others", () => {
    const body = page({ "welfare-health": welfare })

    expect(body).toContain('<a class="column" href="welfare-health/" aria-label="Welfare and health: 2 records. Open its chart.">')
    expect(body.match(/class="marker"/g)).toHaveLength(2)
    expect(body.match(/<div class="column unpublished">/g)).toHaveLength(2)
    expect(body).not.toContain('href="economics/"')
  })

  it("gives the same subject one table row with a score for each published issue", () => {
    const body = page({ "welfare-health": welfare, economics })

    expect(body).toContain('<th class="num">Welfare and health</th><th class="num">Economics</th>')
    expect(body).toContain('<tr><td>Jane Sample</td><td>Sample Caucus</td><td class="num">70</td><td class="num">30</td></tr>')
    expect(body).toContain('<tr><td>Sample Caucus</td><td>Sample Caucus</td><td class="num">40</td><td class="num"></td></tr>')
  })

  it("opens with each party symbol and flag on the page, once each", () => {
    const body = page({
      "welfare-health": siteData([...welfare.records, record("Party A", "party", 80, { flag: "uk" })]),
      economics: siteData([
        ...economics.records,
        record("Party A", "party", 60, { flag: "uk" }),
        record("Party B", "party", 55, { flag: "ca" }),
      ]),
    })
    const opening = body.slice(body.indexOf('<ul class="hero-who"'), body.indexOf("</ul>", body.indexOf('<ul class="hero-who"')))

    expect(opening.match(/#(party|flag)-[a-z]+/g)).toEqual(["#party-donkey", "#party-elephant", "#flag-ca", "#flag-uk"])
  })

  it("still builds when no issue is published", () => {
    const body = page({})

    expect(body).not.toContain('class="marker"')
    expect(body.match(/<div class="column unpublished">/g)).toHaveLength(3)
  })

  it("escapes a name in a mark", () => {
    const body = page({ "welfare-health": siteData([record('Jane "J" <b>', "member", 50)]) })

    expect(body).toContain('data-name="Jane &quot;J&quot; &lt;b&gt;"')
    expect(body).not.toContain('"J" <b>')
  })
})
