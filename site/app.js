const data = JSON.parse(document.getElementById("site-data").textContent)
const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const LABEL_GAP = 8

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

const glyphContent = (record) => (record.flag ? symbol(`flag-${record.flag}`) : record.glyph)

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

const layoutTrack = (track) => {
  const width = track.clientWidth
  const edge = Number.parseFloat(getComputedStyle(track).marginRight)
  const placed = [...track.querySelectorAll(".marker")]
    .map((marker) => {
      marker.classList.remove("flip")
      const half = marker.querySelector(".glyph").offsetWidth / 2
      const center = (Number(marker.dataset.x) / 100) * width
      const size = marker.offsetWidth
      const flip = center - half + size > width + edge
      marker.classList.toggle("flip", flip)
      const left = flip ? center + half - size : center - half
      return { marker, left, right: left + size }
    })
    .sort((a, b) => a.left - b.left)
  const rowEnds = []
  placed.forEach((item) => {
    const fits = rowEnds.findIndex((end) => item.left >= end + LABEL_GAP)
    const row = fits === -1 ? rowEnds.length : fits
    rowEnds[row] = item.right
    item.marker.style.setProperty("--lane-row", String(row))
  })
  track.style.setProperty("--rows", String(Math.max(1, rowEnds.length)))
}

const layoutLanes = () => document.querySelectorAll(".lane .track").forEach(layoutTrack)

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
