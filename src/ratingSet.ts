import { eventsFor, type Packet, type RatingSet } from "./files.ts"

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

const slotProblemsOf = (packet: Packet, slotIds: string[]): string[] => {
  const filled = packet.items.map((item) => item.slot)
  const named = [...filled, ...packet.emptySlots]
  return [
    ...named
      .filter((slot, index) => !slotIds.includes(slot) && named.indexOf(slot) === index)
      .map((slot) => `${packet.id} uses the slot ${slot}, which the category does not have`),
    ...slotIds
      .filter((slot) => !named.includes(slot))
      .map((slot) => `${packet.id} leaves the slot ${slot} unanswered: add an item or list it in emptySlots`),
    ...packet.emptySlots
      .filter((slot) => filled.includes(slot))
      .map((slot) => `${packet.id} lists the slot ${slot} as empty but has an item in it`),
  ]
}

const slotProblems = (set: RatingSet): string[] => {
  const slotIds = set.category.slots.map((slot) => slot.id)
  return ratedPackets(set).flatMap((packet) => slotProblemsOf(packet, slotIds))
}

const missingStanceProblems = (set: RatingSet): string[] =>
  set.packets
    .filter((packet) => packet.items.length > 0)
    .flatMap((packet) =>
      eventsFor(set, packet.id)
        .filter((event) => !packet.items.some((item) => item.event === event.id))
        .map((event) => `${packet.id} takes no stance on the event ${event.id}`),
    )

export const findSetProblems = (set: RatingSet): string[] => [
  ...duplicateIdProblems(set),
  ...missingKeyProblems(set),
  ...slotProblems(set),
  ...missingStanceProblems(set),
  ...leakProblems(set),
]
