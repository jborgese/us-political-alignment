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
  document.getElementById("evidence-sections").replaceChildren(...record.sections.map(sectionNode))
}

const markers = [...document.querySelectorAll(".marker")]

const select = (index) => {
  markers.forEach((marker) => marker.setAttribute("aria-pressed", String(Number(marker.dataset.index) === index)))
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

const layoutScale = () => {
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

const highlight = (name) => {
  groupButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.group === name)))
  plot.toggleAttribute("data-highlight", name !== null)
  recordMarkers.forEach((marker) => marker.classList.toggle("lit", marker.dataset.group === name))
}

groupButtons.forEach((button) =>
  button.addEventListener("click", () =>
    highlight(button.getAttribute("aria-pressed") === "true" ? null : button.dataset.group),
  ),
)

const tooltip = document.getElementById("tooltip")

const showTooltip = (marker) => {
  const record = data.records[Number(marker.dataset.index)]
  const box = marker.querySelector(".glyph").getBoundingClientRect()
  tooltip.replaceChildren(
    `${record.name} `,
    element("b", "", String(record.score)),
    ...(record.range ? [` (${rangeText(record)})`] : []),
  )
  tooltip.hidden = false
  const left = Math.min(Math.max(8, box.left + box.width / 2 - tooltip.offsetWidth / 2), innerWidth - tooltip.offsetWidth - 8)
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${box.top - tooltip.offsetHeight - 8}px`
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

new ResizeObserver(layoutScale).observe(document.querySelector(".scale"))
document.fonts?.ready.then(layoutScale)
select(data.selected)
