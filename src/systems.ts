import type { Systems } from "./files.ts"

type Figure = Systems["figures"][number]
type Country = Systems["countries"][number]
type Goalposts = "range" | "middle" | "excluded"

interface Variant {
  goalposts: Goalposts
  geometric: boolean
  overrides: boolean
  dropped: string | null
}

export interface SystemHalf {
  label: string
  level: number
}

export interface SystemLevel {
  legislature: string
  name: string
  flag: string
  level: number
  low: number
  high: number
  halves: SystemHalf[]
}

const GOALPOSTS: Goalposts[] = ["range", "middle", "excluded"]
const MIDDLE_SHARE = 0.05
const MAIN: Variant = { goalposts: "range", geometric: false, overrides: true, dropped: null }

const mean = (values: number[]): number => values.reduce((total, value) => total + value, 0) / values.length

const quantile = (sorted: number[], share: number): number => {
  const position = share * (sorted.length - 1)
  const below = Math.floor(position)
  const above = Math.min(below + 1, sorted.length - 1)
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below)
}

const goalpostsOf = (systems: Systems, figure: Figure, goalposts: Goalposts): [number, number] => {
  const values = Object.entries(figure.values)
    .filter(([code]) => goalposts !== "excluded" || !systems.exclusion.includes(code))
    .map(([, { value }]) => value)
    .toSorted((a, b) => a - b)
  return goalposts === "middle"
    ? [quantile(values, MIDDLE_SHARE), quantile(values, 1 - MIDDLE_SHARE)]
    : [values[0], values[values.length - 1]]
}

const valueOf = (country: Country, figure: Figure, overrides: boolean): number => {
  const override = overrides ? country.overrides.find((entry) => entry.figure === figure.id) : undefined
  const value = override?.value ?? figure.values[country.code]?.value
  if (value === undefined) throw new Error(`${country.name} has no value for ${figure.id}`)
  return value
}

const scaled = (systems: Systems, country: Country, figure: Figure, variant: Variant): number => {
  const [low, high] = goalpostsOf(systems, figure, variant.goalposts)
  const share = (valueOf(country, figure, variant.overrides) - low) / (high - low)
  return Math.min(100, Math.max(0, share * 100))
}

const figuresIn = (systems: Systems, half: string, dropped: string | null): Figure[] => {
  const figures = systems.figures.filter((figure) => figure.half === half)
  if (figures.length === 0) throw new Error(`No figure belongs to the half ${half}`)
  const kept = figures.filter((figure) => figure.id !== dropped)
  return kept.length > 0 ? kept : figures
}

const halfLevels = (systems: Systems, country: Country, variant: Variant): number[] =>
  systems.halves.map((half) =>
    mean(figuresIn(systems, half.id, variant.dropped).map((figure) => scaled(systems, country, figure, variant))),
  )

const combined = (halves: number[], geometric: boolean): number =>
  geometric ? halves.reduce((product, level) => product * level, 1) ** (1 / halves.length) : mean(halves)

const variantsOf = (systems: Systems): Variant[] =>
  GOALPOSTS.flatMap((goalposts) =>
    [false, true].flatMap((geometric) =>
      [true, false].flatMap((overrides) =>
        [null, ...systems.figures.map((figure) => figure.id)].map((dropped) => ({
          goalposts,
          geometric,
          overrides,
          dropped,
        })),
      ),
    ),
  )

export const systemLevels = (systems: Systems): SystemLevel[] => {
  const variants = variantsOf(systems)
  return systems.countries
    .map((country) => {
      const halves = halfLevels(systems, country, MAIN)
      const levels = variants.map((variant) => combined(halfLevels(systems, country, variant), variant.geometric))
      return {
        legislature: country.legislature,
        name: country.name,
        flag: country.flag,
        level: combined(halves, MAIN.geometric),
        low: Math.min(...levels),
        high: Math.max(...levels),
        halves: systems.halves.map((half, index) => ({ label: half.label, level: halves[index] })),
      }
    })
    .toSorted((a, b) => b.level - a.level)
}
