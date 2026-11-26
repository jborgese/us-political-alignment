import { TIERS, eventsFor, subjectIdOf, type Evidence, type Packet, type RatingSet, type Tier } from "./files.ts"
import { shareOfPairsAgreeingAcrossOrders } from "./scoring.ts"

const FEWEST_OFFICIAL_ACTS = 3
const LARGEST_SPLIT_SHARE = 0.15

export const ratedPackets = (set: RatingSet): Packet[] => [
  ...set.category.anchors,
  ...set.packets.filter((packet) => packet.items.length > 0),
]

export const itemsInSlot = (packet: Packet, slotId: string): Evidence[] =>
  TIERS.flatMap((tier) => packet.items.filter((item) => item.slot === slotId && item.tier === tier))

const splitShare = (set: RatingSet, id: string): number => {
  const own = set.comparisons.filter((comparison) => comparison.first === id || comparison.second === id)
  return own.length === 0 ? 0 : 1 - shareOfPairsAgreeingAcrossOrders(own)
}

const isProvisional = (set: RatingSet, recordId: string): boolean =>
  set.key.subjects.some((subject) => subject.id === subjectIdOf(recordId) && subject.provisional === true)

const countedEvidence = (count: number, provisional: boolean): string => {
  const acts = `${count} official ${count === 1 ? "act" : "acts"}`
  return provisional ? `${acts} or ${count === 1 ? "statement" : "statements"}` : acts
}

export const thinEvidenceReasons = (set: RatingSet, packet: Packet): string[] => {
  const provisional = isProvisional(set, packet.id)
  const countedTiers: Tier[] = provisional ? ["official_act", "statement"] : ["official_act"]
  const counted = packet.items.filter((item) => countedTiers.includes(item.tier)).length
  const split = splitShare(set, packet.id)
  return [
    ...set.category.slots
      .filter((slot) => slot.required && !provisional && itemsInSlot(packet, slot.id).length === 0)
      .map((slot) => `nothing under "${slot.heading}"`),
    ...(counted < FEWEST_OFFICIAL_ACTS
      ? [`${countedEvidence(counted, provisional)}, fewer than ${FEWEST_OFFICIAL_ACTS}`]
      : []),
    ...(split > LARGEST_SPLIT_SHARE
      ? [`${Math.round(split * 100)}% of its pairs changed winner with the order shown`]
      : []),
  ]
}

export const packetsWithoutEvidence = (set: RatingSet): Packet[] =>
  set.packets.filter((packet) => packet.items.length === 0)

export const subjectsWithoutPackets = (set: RatingSet): string[] => {
  const packetIds = [...set.packets, ...set.placements].map((packet) => packet.id)
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
  return [...ratedPackets(set), ...set.rewordings, ...set.placements].flatMap((packet) =>
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
  return [...set.packets, ...set.placements]
    .filter((packet) => !keyIds.includes(subjectIdOf(packet.id)))
    .map((packet) => `${packet.id} has no entry in key.json`)
}

const placementProblems = (set: RatingSet): string[] => {
  const onScale = set.packets.map((packet) => packet.id)
  return set.placements.flatMap(({ id }) => {
    const copyOf = subjectIdOf(id)
    if (copyOf === id) {
      return onScale.includes(id) ? [`${id} is both on the scale and placed: keep it in packets/ or placements/`] : []
    }
    return onScale.includes(copyOf) ? [] : [`${id} copies ${copyOf}, which has no packet on the scale`]
  })
}

const provisionalOnScaleProblems = (set: RatingSet): string[] =>
  set.packets
    .filter((packet) => isProvisional(set, packet.id))
    .map((packet) => `${packet.id} is provisional: move it from packets/ to placements/`)

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
  return [...ratedPackets(set), ...set.placements.filter((packet) => packet.items.length > 0)].flatMap((packet) =>
    slotProblemsOf(packet, slotIds),
  )
}

const stanceProblemsOf = (set: RatingSet, packet: Packet): string[] => {
  const eventIds = eventsFor(set, packet.id).map((event) => event.id)
  const stanced = packet.items.flatMap((item) => (item.event === undefined ? [] : [item.event]))
  const noPosition = packet.noPosition ?? []
  return [
    ...eventIds
      .filter((id) => !stanced.includes(id) && !noPosition.includes(id))
      .map((id) => `${packet.id} takes no stance on the event ${id}: add a stance or list it in noPosition`),
    ...noPosition
      .filter((id) => !eventIds.includes(id))
      .map((id) => `${packet.id} lists ${id} under noPosition, which is not an event of its legislature`),
    ...noPosition
      .filter((id) => stanced.includes(id))
      .map((id) => `${packet.id} lists ${id} under noPosition but takes a stance on it`),
  ]
}

const missingStanceProblems = (set: RatingSet): string[] =>
  [...set.packets, ...set.placements]
    .filter((packet) => packet.items.length > 0)
    .flatMap((packet) => stanceProblemsOf(set, packet))

const numbersIn = (text: string): string => (text.match(/\d+(?:[.,]\d+)*/g) ?? []).toSorted().join(", ") || "none"

const rewordingProblems = (set: RatingSet): string[] =>
  set.rewordings.flatMap((rewording) => {
    const base = set.packets.find((packet) => packet.id === rewording.baseId)
    return rewording.items.flatMap((item, index) => {
      const original = base?.items[index].text ?? ""
      return [
        ...(item.text === original
          ? [`${rewording.id} repeats the wording of item ${index + 1} of ${rewording.baseId}`]
          : []),
        ...(numbersIn(item.text) === numbersIn(original)
          ? []
          : [
              `${rewording.id} changes the numbers in item ${index + 1} of ${rewording.baseId}: ${numbersIn(original)} became ${numbersIn(item.text)}`,
            ]),
      ]
    })
  })

export const findSetProblems = (set: RatingSet): string[] => [
  ...duplicateIdProblems(set),
  ...missingKeyProblems(set),
  ...placementProblems(set),
  ...provisionalOnScaleProblems(set),
  ...slotProblems(set),
  ...missingStanceProblems(set),
  ...leakProblems(set),
  ...rewordingProblems(set),
]
