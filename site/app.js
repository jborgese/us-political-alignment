const data = JSON.parse(document.getElementById("site-data").textContent)
const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const LEADER = 32
const LABEL_GAP = 3

const element = (tag, className, text) => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const symbol = (id, className) => {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg")
  const use = document.createElementNS(SVG_NAMESPACE, "use")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("aria-hidden", "true")
  if (className) svg.setAttribute("class", className)
  use.setAttribute("href", `#${id}`)
  svg.append(use)
  return svg
}

const glyphContent = (record) => {
  if (record.flag) return symbol(`flag-${record.flag}`)
  return record.symbol ? symbol(`party-${record.symbol}`, "party-symbol") : record.glyph
}

const sourceLinks = (sources) => {
  const links = sources
    .filter((url) => /^https?:\/\//.test(url))
    .map((url, index) => {
      const link = element("a", "", String(index + 1))
      link.href = url
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      link.setAttribute("aria-label", `Source ${index + 1}`)
      return link
    })
  const holder = element("span", "sources")
  holder.append(...links)
  return holder
}

const itemNode = (item) => {
  const row = element("li")
  const text = element("div", "", item.text)
  if (item.sources.length > 0) text.append(sourceLinks(item.sources))
  row.append(symbol(`i-${item.tier}`, "icon"), text)
  return row
}

const emptyNode = () => {
  const row = element("li", "none")
  row.append(symbol("i-none", "icon"), element("div", "", "No recorded act"))
  return row
}

const sectionNode = (section) => {
  const block = element("div", "section")
  const list = element("ul")
  list.append(...(section.items.length > 0 ? section.items.map(itemNode) : [emptyNode()]))
  block.append(element("h3", "", section.heading), list)
  return block
}

const changeText = (record) => {
  if (record.previousScore === null) return ""
  const change = record.score - record.previousScore
  if (change === 0) return "unchanged since the previous run"
  return `${change > 0 ? "up" : "down"} ${Math.abs(change)} since the previous run`
}

const rangeText = (record) => {
  if (!record.range) return ""
  if (record.range.low === record.range.high) return "same score when reworded"
  return `${record.range.low} to ${record.range.high} when reworded`
}

const showEvidence = (record) => {
  const head = document.getElementById("evidence-head")
  head.dataset.kind = record.kind
  head.dataset.symbol = record.symbol ?? ""
  document.getElementById("evidence-glyph").replaceChildren(glyphContent(record))
  document.getElementById("evidence-name").textContent = record.name
  document.getElementById("evidence-detail").textContent = record.detail
  document.getElementById("evidence-score").textContent = String(record.score)
  document.getElementById("evidence-change").textContent = changeText(record)
  document.getElementById("evidence-range").textContent = rangeText(record)
  document.getElementById("evidence-left-right").textContent =
    record.leftRight === null ? "" : `${record.leftRight} on the left-right axis`
  document.getElementById("evidence-sections").replaceChildren(...record.sections.map(sectionNode))
}

const markers = [...document.querySelectorAll(".marker")]

const seatNodes = [...document.querySelectorAll("[data-list]")]
const seatOf = (node) => data.chambers[Number(node.dataset.chamber)][node.dataset.list][Number(node.dataset.seat)]
const markSeats = (isPicked) => seatNodes.forEach((node) => node.classList.toggle("picked", isPicked(node)))

const select = (index) => {
  markers.forEach((marker) => marker.setAttribute("aria-pressed", String(Number(marker.dataset.index) === index)))
  markSeats((node) => seatOf(node).index === index)
  showEvidence(data.records[index])
}

const recordMarkers = markers.filter((marker) => marker.closest(".records"))

const blockOf = (items) => {
  const offsets = items.map((_, index) => items.slice(0, index).reduce((sum, item) => sum + item.height + LABEL_GAP, 0))
  const size = offsets.at(-1) + items.at(-1).height
  const top = items.reduce((sum, item, index) => sum + item.ideal - offsets[index], 0) / items.length
  return { items, offsets, size, top }
}

const stack = (blocks, block) => {
  const previous = blocks.at(-1)
  if (!previous || previous.top + previous.size + LABEL_GAP <= block.top) return [...blocks, block]
  return stack(blocks.slice(0, -1), blockOf([...previous.items, ...block.items]))
}

const spreadLabels = (entries, bottom) =>
  entries
    .reduce((blocks, entry) => stack(blocks, blockOf([entry])), [])
    .flatMap((block) => {
      const top = Math.min(Math.max(block.top, 0), bottom - block.size)
      return block.items.map((item, position) => ({ ...item, labelTop: top + block.offsets[position] }))
    })

const LABEL_ROOM = 2
const LABEL_SPOTS = [[], ["flip"], ["up"], ["down"], ["flip", "up"], ["flip", "down"]]
const LABEL_CLASSES = ["flip", "up", "down", "quiet"]

const roomAround = (box) => ({
  left: box.left - LABEL_ROOM,
  right: box.right + LABEL_ROOM,
  top: box.top - LABEL_ROOM,
  bottom: box.bottom + LABEL_ROOM,
})

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

const layoutLeftRight = () => {
  dodge(recordMarkers)
  const field = document.querySelector(".records").getBoundingClientRect()
  const glyphs = recordMarkers.map((marker) => marker.querySelector(".glyph").getBoundingClientRect())
  const fits = (box, taken, ownGlyph) =>
    box.left >= field.left &&
    box.right <= field.right &&
    ![...taken, ...glyphs.filter((other) => other !== ownGlyph)].some((other) => overlaps(roomAround(box), other))
  recordMarkers
    .map((marker, index) => ({ marker, glyph: glyphs[index], name: marker.querySelector(".name") }))
    .sort((a, b) => a.glyph.top - b.glyph.top)
    .reduce((taken, { glyph, name }) => {
      const spot = LABEL_SPOTS.find((classes) => {
        name.classList.remove(...LABEL_CLASSES)
        name.classList.add(...classes)
        return fits(name.getBoundingClientRect(), taken, glyph)
      })
      name.classList.remove(...LABEL_CLASSES)
      if (spot === undefined) {
        name.classList.add("quiet")
        return taken
      }
      name.classList.add(...spot)
      return [...taken, name.getBoundingClientRect()]
    }, [])
}

const layoutScale = () => {
  const scalePlot = document.querySelector(".plot")
  if (scalePlot.offsetParent === null) return
  if (scalePlot.classList.contains("left-right")) return layoutLeftRight()
  const placed = dodge(recordMarkers)
  const reach = Math.max(...placed.map(({ nudge, size }) => nudge + size / 2))
  const entries = placed.map((item) => {
    const height = item.marker.querySelector(".name").offsetHeight
    return { ...item, height, ideal: item.top + item.size / 2 - height / 2 }
  })
  spreadLabels(entries, document.querySelector(".records").offsetHeight).forEach(
    ({ marker, size, nudge, ideal, labelTop }) => {
      const labelX = reach + LEADER + size / 2 - nudge
      const shift = labelTop - ideal
      const run = labelX - size
      marker.style.setProperty("--label-x", `${labelX}px`)
      marker.style.setProperty("--label-shift", `${shift}px`)
      marker.style.setProperty("--leader-length", `${Math.hypot(run, shift)}px`)
      marker.style.setProperty("--leader-angle", `${Math.atan2(shift, run)}rad`)
    },
  )
}

const plot = document.querySelector(".plot")
const groupButtons = [...document.querySelectorAll(".group")]
const countryButtons = [...document.querySelectorAll(".country")]

const highlight = (key, value) => {
  groupButtons.forEach((button) =>
    button.setAttribute("aria-pressed", String(key === "group" && button.dataset.group === value)),
  )
  countryButtons.forEach((button) =>
    button.setAttribute("aria-pressed", String(key === "legislature" && button.dataset.legislature === value)),
  )
  plot.toggleAttribute("data-highlight", value !== null)
  recordMarkers.forEach((marker) => marker.classList.toggle("lit", value !== null && marker.dataset[key] === value))
}

const toggleOn = (key) => (button) =>
  button.addEventListener("click", () =>
    highlight(key, button.getAttribute("aria-pressed") === "true" ? null : button.dataset[key]),
  )

groupButtons.forEach(toggleOn("group"))
countryButtons.forEach(toggleOn("legislature"))

const tooltip = document.getElementById("tooltip")

const placeTooltip = (box, ...content) => {
  tooltip.replaceChildren(...content)
  tooltip.hidden = false
  const left = Math.min(Math.max(8, box.left + box.width / 2 - tooltip.offsetWidth / 2), innerWidth - tooltip.offsetWidth - 8)
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${box.top - tooltip.offsetHeight - 8}px`
}

const showTooltip = (marker) => {
  const record = data.records[Number(marker.dataset.index)]
  placeTooltip(
    marker.querySelector(".glyph").getBoundingClientRect(),
    `${record.name} `,
    element("b", "", String(record.score)),
    ...(record.range ? [` (${rangeText(record)})`] : []),
  )
}

const hideTooltip = () => {
  tooltip.hidden = true
}

markers.forEach((marker) => {
  marker.addEventListener("click", () => select(Number(marker.dataset.index)))
  marker.addEventListener("pointerenter", () => showTooltip(marker))
  marker.addEventListener("focus", () => showTooltip(marker))
  marker.addEventListener("pointerleave", hideTooltip)
  marker.addEventListener("blur", hideTooltip)
})
addEventListener("scroll", hideTooltip, { passive: true })

const partyText = (seat) => `${seat.party ?? "No party"}${seat.caucusesWith ? ` (${seat.caucusesWith} caucus)` : ""}`

const seatStatus = (seat) => {
  const record = seat.index === null ? null : data.records[seat.index]
  const who = `${seat.name}, ${partyText(seat)}`
  if (record === null) return `${who}: ${seat.note}.`
  const leftRight = record.leftRight === null ? ` ${seat.note}.` : `, ${record.leftRight} on the left-right axis.`
  return `${who}: ${record.score} on this issue${leftRight} Evidence below.`
}

const pickSeat = (node) => {
  const seat = seatOf(node)
  document.querySelector(`.chamber-status[data-chamber="${node.dataset.chamber}"]`).textContent = seatStatus(seat)
  if (seat.index !== null) select(seat.index)
  markSeats((other) => other === node)
}

const showSeatTooltip = (node) => {
  const seat = seatOf(node)
  const record = seat.index === null ? null : data.records[seat.index]
  placeTooltip(node.getBoundingClientRect(), `${seat.name} `, record ? element("b", "", String(record.score)) : "not placed")
}

seatNodes.forEach((node) => {
  node.addEventListener("click", () => pickSeat(node))
  node.addEventListener("pointerenter", () => showSeatTooltip(node))
  node.addEventListener("focus", () => showSeatTooltip(node))
  node.addEventListener("pointerleave", hideTooltip)
  node.addEventListener("blur", hideTooltip)
})

document.querySelectorAll(".member-search input").forEach((input) =>
  input.addEventListener("input", () => {
    const wanted = input.value.trim().toLowerCase()
    const node = seatNodes.find(
      (seatNode) => seatNode.dataset.chamber === input.dataset.chamber && seatOf(seatNode).name.toLowerCase() === wanted,
    )
    if (node) pickSeat(node)
  }),
)

const tabs = [...document.querySelectorAll('[role="tab"]')]

const showTab = (chosen) => {
  tabs.forEach((tab) => {
    const on = tab === chosen
    tab.setAttribute("aria-selected", String(on))
    tab.tabIndex = on ? 0 : -1
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !on
  })
  hideTooltip()
  layoutScale()
}

const TAB_STEPS = { ArrowRight: 1, ArrowLeft: -1 }

tabs.forEach((tab, position) => {
  tab.addEventListener("click", () => showTab(tab))
  tab.addEventListener("keydown", (event) => {
    const step = TAB_STEPS[event.key]
    if (step === undefined) return
    event.preventDefault()
    const next = tabs[(position + step + tabs.length) % tabs.length]
    next.focus()
    showTab(next)
  })
})

new ResizeObserver(layoutScale).observe(document.querySelector(".scale"))
document.fonts?.ready.then(layoutScale)
select(data.selected)
