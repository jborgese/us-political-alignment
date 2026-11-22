import type { Packet, RatingSet } from "./files.ts"

export const ratedPackets = (set: RatingSet): Packet[] => [
  ...set.category.anchors,
  ...set.packets.filter((packet) => packet.items.length > 0),
]

export const packetsWithoutEvidence = (set: RatingSet): Packet[] =>
  set.packets.filter((packet) => packet.items.length === 0)

export const subjectsWithoutPackets = (set: RatingSet): string[] => {
  const packetIds = set.packets.map((packet) => packet.id)
  return set.key.subjects.map((subject) => subject.id).filter((id) => !packetIds.includes(id))
}

const escapeForRegExp = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const isAcronym = (term: string): boolean => term === term.toUpperCase()

const mentions = (text: string, term: string): boolean =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeForRegExp(term)}(?![\\p{L}\\p{N}])`, isAcronym(term) ? "u" : "iu").test(
    text,
  )

const forbiddenTerms = (set: RatingSet): string[] => [
  ...set.key.revealingTerms,
  ...set.key.subjects.flatMap((subject) => [subject.name, ...subject.aliases]),
]

const leakProblems = (set: RatingSet): string[] => {
  const terms = forbiddenTerms(set)
  return ratedPackets(set).flatMap((packet) =>
    packet.items.flatMap((item) =>
      terms
        .filter((term) => mentions(item.text, term))
        .map((term) => `${packet.id} mentions "${term}": ${item.text}`),
    ),
  )
}

const duplicateIdProblems = (set: RatingSet): string[] => {
  const ids = [...set.category.anchors, ...set.packets].map((packet) => packet.id)
  return ids
    .filter((id, index) => ids.indexOf(id) !== index && ids.lastIndexOf(id) === index)
    .map((id) => `More than one record has the id ${id}`)
}

const missingKeyProblems = (set: RatingSet): string[] => {
  const keyIds = set.key.subjects.map((subject) => subject.id)
  return set.packets
    .filter((packet) => !keyIds.includes(packet.id))
    .map((packet) => `${packet.id} has no entry in key.json`)
}

export const findSetProblems = (set: RatingSet): string[] => [
  ...duplicateIdProblems(set),
  ...missingKeyProblems(set),
  ...leakProblems(set),
]
