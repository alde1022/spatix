import maplibregl from "maplibre-gl"

/**
 * Handles missing sprite images in basemap styles (e.g. "circle-11" from OpenFreeMap).
 * Generates a simple circle fallback so MapLibre doesn't throw console errors.
 */
export function handleMissingImages(map: maplibregl.Map) {
  map.on("styleimagemissing", (e) => {
    const id = e.id
    if (map.hasImage(id)) return

    const size = 16
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
    ctx.fillStyle = "#888"
    ctx.fill()
    ctx.strokeStyle = "#666"
    ctx.lineWidth = 1
    ctx.stroke()

    const imageData = ctx.getImageData(0, 0, size, size)
    map.addImage(id, { width: size, height: size, data: new Uint8Array(imageData.data.buffer) })
  })
}
