"use client"

import { useRef, useEffect, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

// Demo points - SF coffee shops
const POINTS = [
  [-122.4086, 37.7823],
  [-122.4105, 37.7715],
  [-122.4215, 37.7565],
  [-122.4335, 37.7642],
  [-122.4052, 37.7821],
  [-122.4223, 37.7672],
  [-122.4178, 37.7538],
  [-122.4312, 37.7891],
  [-122.3987, 37.7756],
  [-122.4445, 37.7612],
  [-122.4156, 37.7834],
  [-122.4278, 37.7589],
]

type VizType = "points" | "bubbles" | "heatmap"

const VIZ_OPTIONS: { id: VizType; label: string; icon: string }[] = [
  { id: "points", label: "Points", icon: "●" },
  { id: "bubbles", label: "Bubbles", icon: "◉" },
  { id: "heatmap", label: "Heatmap", icon: "▣" },
]

export default function HeroMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [vizType, setVizType] = useState<VizType>("points")

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [-122.42, 37.77],
      zoom: 11.5,
      interactive: true,
      attributionControl: false,
    })

    m.on("load", () => {
      map.current = m

      // Add source
      m.addSource("points", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: POINTS.map((coords, i) => ({
            type: "Feature",
            properties: { value: Math.random() * 50 + 10 },
            geometry: { type: "Point", coordinates: coords }
          }))
        }
      })

      // Points layer
      m.addLayer({
        id: "viz-points",
        type: "circle",
        source: "points",
        paint: {
          "circle-radius": 8,
          "circle-color": "#6366f1",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 1
        }
      })

      // Bubbles layer (hidden initially)
      m.addLayer({
        id: "viz-bubbles",
        type: "circle",
        source: "points",
        paint: {
          "circle-radius": ["*", ["get", "value"], 0.8],
          "circle-color": "#6366f1",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.6
        },
        layout: { visibility: "none" }
      })

      // Heatmap layer (hidden initially)
      m.addLayer({
        id: "viz-heatmap",
        type: "heatmap",
        source: "points",
        paint: {
          "heatmap-weight": ["get", "value"],
          "heatmap-intensity": 0.6,
          "heatmap-radius": 30,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "#6366f1",
            0.4, "#818cf8",
            0.6, "#a5b4fc",
            0.8, "#c7d2fe",
            1, "#e0e7ff"
          ],
          "heatmap-opacity": 0.8
        },
        layout: { visibility: "none" }
      })

      setLoaded(true)
    })

    return () => { m.remove(); map.current = null }
  }, [])

  // Update visualization when type changes
  useEffect(() => {
    const m = map.current
    if (!m || !loaded) return

    const layers = ["viz-points", "viz-bubbles", "viz-heatmap"]
    layers.forEach(layer => {
      if (m.getLayer(layer)) {
        m.setLayoutProperty(layer, "visibility", "none")
      }
    })

    const activeLayer = `viz-${vizType}`
    if (m.getLayer(activeLayer)) {
      m.setLayoutProperty(activeLayer, "visibility", "visible")
    }
  }, [vizType, loaded])

  return (
    <div className="relative h-full bg-[#242730]">
      {/* Map */}
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Loading */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#242730]">
          <div className="animate-spin w-8 h-8 border-3 border-[#6366f1] border-t-transparent rounded-full" />
        </div>
      )}

      {/* Visualization Toggle */}
      {loaded && (
        <div className="absolute top-4 left-4 bg-[#1e1e24]/90 backdrop-blur-sm rounded-xl p-1 flex gap-1 shadow-xl border border-white/10">
          {VIZ_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setVizType(opt.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                vizType === opt.id
                  ? "bg-[#6366f1] text-white shadow-lg"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              <span className="text-base">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Info badge */}
      {loaded && (
        <div className="absolute bottom-4 left-4 bg-[#1e1e24]/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-white/70 border border-white/10">
          <span className="text-white font-medium">12 locations</span> · SF Coffee Shops
        </div>
      )}
    </div>
  )
}
