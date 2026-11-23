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

const CROWDED_SHARE = 0.7

const clustersOf = (placed) =>
  placed.reduce((clusters, item) => {
    const cluster = clusters.at(-1)
    const crowded = cluster && item.top - cluster.at(-1).top < item.size * CROWDED_SHARE
    return crowded ? [...clusters.slice(0, -1), [...cluster, item]] : [...clusters, [item]]
  }, [])

const layoutSlot = (markers) => {
  const placed = markers
    .map((marker) => ({ marker, top: marker.offsetTop, size: marker.querySelector(".glyph").offsetHeight }))
    .sort((a, b) => a.top - b.top)
  clustersOf(placed).reduce(
    (labelBottom, cluster) =>
      cluster.reduce((bottom, item, position) => {
        const shift = Math.max(0, bottom - item.top)
        item.marker.style.setProperty("--nudge", `${position * GLYPH_NUDGE}px`)
        item.marker.style.setProperty("--label-indent", `${(cluster.length - 1 - position) * GLYPH_NUDGE}px`)
        item.marker.style.setProperty("--label-shift", `${shift}px`)
        return item.top + shift + LABEL_HEIGHT
      }, labelBottom),
    -Infinity,
  )
}

const layoutColumn = (column) => {
  const markers = [...column.querySelectorAll(".marker")]
  const kinds = markers.map((marker) => marker.dataset.kind).filter((kind, index, all) => all.indexOf(kind) === index)
  kinds.forEach((kind) => layoutSlot(markers.filter((marker) => marker.dataset.kind === kind)))
}

const layoutLanes = () => document.querySelectorAll(".column").forEach(layoutColumn)

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

new ResizeObserver(layoutLanes).observe(document.querySelector(".scale"))
document.fonts?.ready.then(layoutLanes)
select(data.selected)
