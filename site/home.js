const tooltip = document.getElementById("tooltip")
const marks = [...document.querySelectorAll(".overview .marker")]

const showTooltip = (mark) => {
  const score = document.createElement("b")
  score.textContent = mark.dataset.score
  tooltip.replaceChildren(`${mark.dataset.name} `, score)
  tooltip.hidden = false
  const box = mark.getBoundingClientRect()
  const left = Math.min(Math.max(8, box.left + box.width / 2 - tooltip.offsetWidth / 2), innerWidth - tooltip.offsetWidth - 8)
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${box.top - tooltip.offsetHeight - 8}px`
  marks.forEach((other) => other.classList.toggle("same", other.dataset.name === mark.dataset.name))
}

const hideTooltip = () => {
  tooltip.hidden = true
  marks.forEach((mark) => mark.classList.remove("same"))
}

marks.forEach((mark) => {
  mark.addEventListener("pointerenter", () => showTooltip(mark))
  mark.addEventListener("pointerleave", hideTooltip)
})
addEventListener("scroll", hideTooltip, { passive: true })

const layoutColumns = () =>
  document.querySelectorAll(".overview .column").forEach((column) => dodge([...column.querySelectorAll(".marker")]))

new ResizeObserver(layoutColumns).observe(document.querySelector(".scale"))
document.fonts?.ready.then(layoutColumns)
