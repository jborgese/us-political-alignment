const CLEARANCE = 0.82
const STEP = 0.45
const OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]

const dodge = (markers) =>
  markers
    .map((marker) => ({ marker, top: marker.offsetTop, size: marker.querySelector(".glyph").offsetHeight }))
    .sort((a, b) => a.top - b.top)
    .reduce((placed, item) => {
      const gap = item.size * CLEARANCE
      const near = placed.filter((other) => Math.abs(other.top - item.top) < gap)
      const clear = (nudge) => near.every((other) => Math.hypot(other.nudge - nudge, other.top - item.top) >= gap)
      const nudge = (OFFSETS.map((offset) => offset * item.size * STEP).find(clear) ?? 0)
      item.marker.style.setProperty("--nudge", `${nudge}px`)
      return [...placed, { ...item, nudge }]
    }, [])
