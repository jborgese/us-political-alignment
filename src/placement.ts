import type { Scores } from "./scoring.ts"

export const PANEL_SIZE = 10

export const choosePanel = (scores: Scores, eligibleIds: string[], size = PANEL_SIZE): string[] => {
  const ranked = eligibleIds.toSorted((a, b) => scores[b] - scores[a] || a.localeCompare(b))
  if (ranked.length <= size) return ranked
  return Array.from({ length: size }, (_, index) => ranked[Math.round((index * (ranked.length - 1)) / (size - 1))])
}
