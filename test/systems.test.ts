import { describe, expect, it } from "vitest"

import type { Systems } from "../src/files.ts"
import { systemLevels } from "../src/systems.ts"

type Figure = Systems["figures"][number]
type Country = Systems["countries"][number]

const figure = (id: string, half: string, values: Record<string, number>): Figure => ({
  id,
  half,
  label: id,
  source: "https://example.org/data",
  values: Object.fromEntries(Object.entries(values).map(([code, value]) => [code, { value, year: 2024 }])),
})

const country = (code: string, overrides: Country["overrides"] = []): Country => ({
  legislature: `${code.toLowerCase()}-house`,
  code,
  name: code,
  flag: code.toLowerCase(),
  overrides,
})

const systemsOf = (figures: Figure[], countries: Country[]): Systems => ({
  title: "How firm each system is",
  scope: "Taxes and rules",
  halves: [
    { id: "taxes", label: "Taxes" },
    { id: "rules", label: "Rules" },
  ],
  figures,
  exclusion: [],
  countries,
})

const TAX = figure("tax", "taxes", { AAA: 20, BBB: 30, CCC: 40 })
const WAGE = figure("wage", "rules", { AAA: 0, BBB: 100, CCC: 50 })

describe("systemLevels", () => {
  it("places each figure between the lowest and highest values listed and averages the two halves", () => {
    const [higher, lower] = systemLevels(systemsOf([TAX, WAGE], [country("AAA"), country("BBB")]))

    expect(higher).toMatchObject({
      name: "BBB",
      level: 75,
      halves: [
        { label: "Taxes", level: 50 },
        { label: "Rules", level: 100 },
      ],
    })
    expect(lower).toMatchObject({ name: "AAA", level: 0 })
  })

  it("weights the two halves equally whatever number of figures each holds", () => {
    const rate = figure("rate", "taxes", { AAA: 10, BBB: 10, CCC: 20 })
    const [level] = systemLevels(systemsOf([TAX, rate, WAGE], [country("BBB")]))

    expect(level.level).toBe(62.5)
  })

  it("uses a country's own figure in its level and keeps the replaced figure inside its range", () => {
    const own = [{ figure: "wage", value: 50, year: 2024, source: "https://example.org/own" }]
    const [level] = systemLevels(systemsOf([TAX, WAGE], [country("BBB", own)]))

    expect(level.level).toBe(50)
    expect(level.low).toBeLessThanOrEqual(50)
    expect(level.high).toBeGreaterThanOrEqual(75)
  })

  it("refuses a country with no value for a figure", () => {
    expect(() => systemLevels(systemsOf([TAX, WAGE], [country("DDD")]))).toThrow("DDD has no value for tax")
  })
})
