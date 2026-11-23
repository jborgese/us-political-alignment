const data = JSON.parse(document.getElementById("site-data").textContent)
const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const LABEL_HEIGHT = 16
const GLYPH_NUDGE = 18

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

const showEvidence = (record) => {
  const head = document.getElementById("evidence-head")
  head.dataset.kind = record.kind
  head.dataset.symbol = record.symbol ?? ""
  document.getElementById("evidence-glyph").replaceChildren(glyphContent(record))
  document.getElementById("evidence-name").textContent = record.name
  document.getElementById("evidence-detail").textContent = record.detail
  document.getElementById("evidence-score").textContent = String(record.score)
  document.getElementById("evidence-sections").replaceChildren(...record.sections.map(sectionNode))
}

const markers = [...document.querySelectorAll(".marker")]

const select = (index) => {
  markers.forEach((marker) => marker.setAttribute("aria-pressed", String(Number(marker.dataset.index) === index)))
  showEvidence(data.records[index])
}

const sameSlot = (a, b) => a.dataset.kind === b.dataset.kind

const layoutColumn = (column) => {
  const placed = [...column.querySelectorAll(".marker")]
    .map((marker) => ({ marker, top: marker.offsetTop, size: marker.querySelector(".glyph").offsetHeight }))
    .sort((a, b) => a.top - b.top)
  placed.reduce(
    (previous, item) => {
      const crowded = previous.item && sameSlot(previous.item.marker, item.marker) && item.top - previous.item.top < item.size * 0.7
      const nudge = crowded ? previous.nudge + GLYPH_NUDGE : 0
      const shift = Math.max(0, previous.labelBottom - item.top)
      item.marker.style.setProperty("--nudge", `${nudge}px`)
      item.marker.style.setProperty("--label-shift", `${shift}px`)
      return { item, nudge, labelBottom: item.top + shift + LABEL_HEIGHT }
    },
    { item: null, nudge: 0, labelBottom: -Infinity },
  )
}

const layoutLanes = () => document.querySelectorAll(".column").forEach(layoutColumn)

const tooltip = document.getElementById("tooltip")

const showTooltip = (marker) => {
  const record = data.records[Number(marker.dataset.index)]
  const box = marker.querySelector(".glyph").getBoundingClientRect()
  tooltip.replaceChildren(`${record.name} `, element("b", "", String(record.score)))
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

new ResizeObserver(layoutLanes).observe(document.querySelector(".scale"))
document.fonts?.ready.then(layoutLanes)
select(data.selected)
