"use client"

import { useRef, useEffect, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

type VizType = "points" | "bubbles" | "heatmap"

export default function HeroMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [vizType, setVizType] = useState<VizType>("points")
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
      center: [-122.42, 37.77],
      zoom: 12,
      attributionControl: false,
    })

    m.on("load", () => {
      map.current = m
      
      // SF Coffee shop data
      const geojson = {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { name: "Blue Bottle", value: 45 }, geometry: { type: "Point", coordinates: [-122.4086, 37.7823] }},
          { type: "Feature", properties: { name: "Sightglass", value: 52 }, geometry: { type: "Point", coordinates: [-122.4105, 37.7715] }},
          { type: "Feature", properties: { name: "Ritual", value: 38 }, geometry: { type: "Point", coordinates: [-122.4215, 37.7565] }},
          { type: "Feature", properties: { name: "Philz", value: 61 }, geometry: { type: "Point", coordinates: [-122.4335, 37.7642] }},
          { type: "Feature", properties: { name: "Verve", value: 33 }, geometry: { type: "Point", coordinates: [-122.4052, 37.7821] }},
          { type: "Feature", properties: { name: "Four Barrel", value: 47 }, geometry: { type: "Point", coordinates: [-122.4223, 37.7672] }},
          { type: "Feature", properties: { name: "Equator", value: 29 }, geometry: { type: "Point", coordinates: [-122.4178, 37.7538] }},
          { type: "Feature", properties: { name: "Stanza", value: 55 }, geometry: { type: "Point", coordinates: [-122.4312, 37.7891] }},
          { type: "Feature", properties: { name: "Wrecking Ball", value: 41 }, geometry: { type: "Point", coordinates: [-122.3987, 37.7756] }},
          { type: "Feature", properties: { name: "Saint Frank", value: 36 }, geometry: { type: "Point", coordinates: [-122.4445, 37.7612] }},
          { type: "Feature", properties: { name: "Andytown", value: 58 }, geometry: { type: "Point", coordinates: [-122.4156, 37.7834] }},
          { type: "Feature", properties: { name: "Linea", value: 44 }, geometry: { type: "Point", coordinates: [-122.4278, 37.7589] }},
        ]
      }

      m.addSource("coffee", { type: "geojson", data: geojson as any })

      // POINTS - colorful circles
      m.addLayer({
        id: "layer-points",
        type: "circle",
        source: "coffee",
        paint: {
          "circle-radius": 10,
          "circle-color": "#6366f1",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.9
        }
      })

      // BUBBLES - sized by value
      m.addLayer({
        id: "layer-bubbles",
        type: "circle",
        source: "coffee",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["*", ["get", "value"], 0.4],
          "circle-color": [
            "interpolate", ["linear"], ["get", "value"],
            25, "#22c55e",
            40, "#eab308", 
            55, "#ef4444"
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.75
        }
      })

      // HEATMAP
      m.addLayer({
        id: "layer-heatmap",
        type: "heatmap",
        source: "coffee",
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "value"], 20, 0, 60, 1],
          "heatmap-intensity": 1.5,
          "heatmap-radius": 40,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.1, "#312e81",
            0.3, "#4f46e5",
            0.5, "#818cf8",
            0.7, "#c4b5fd",
            0.9, "#fef08a",
            1, "#fde047"
          ],
          "heatmap-opacity": 0.85
        }
      })

      setMapLoaded(true)
    })

    return () => { m.remove(); map.current = null }
  }, [])

  // Switch visualization
  useEffect(() => {
    const m = map.current
    if (!m || !mapLoaded) return

    const layers = ["layer-points", "layer-bubbles", "layer-heatmap"]
    layers.forEach(id => {
      if (m.getLayer(id)) {
        m.setLayoutProperty(id, "visibility", id === `layer-${vizType}` ? "visible" : "none")
      }
    })
  }, [vizType, mapLoaded])

  return (
    <div className="w-full h-full relative bg-slate-200 rounded-b-xl overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0" />
      
      {/* Toggle buttons */}
      <div className="absolute top-3 left-3 flex gap-1 bg-white/95 backdrop-blur rounded-lg p-1 shadow-lg z-10">
        {[
          { id: "points" as VizType, label: "Points", icon: "⬤" },
          { id: "bubbles" as VizType, label: "Bubbles", icon: "◉" },
          { id: "heatmap" as VizType, label: "Heatmap", icon: "▦" },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setVizType(opt.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              vizType === opt.id
                ? "bg-indigo-600 text-white shadow"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <span>{opt.icon}</span>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Data label */}
      <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-lg px-3 py-1.5 shadow-lg z-10">
        <div className="text-xs font-semibold text-slate-800">12 Coffee Shops</div>
        <div className="text-[10px] text-slate-500">San Francisco, CA</div>
      </div>

      {/* Legend for bubbles */}
      {vizType === "bubbles" && (
        <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur rounded-lg px-3 py-2 shadow-lg z-10">
          <div className="text-[10px] font-semibold text-slate-600 mb-1">Daily Visitors</div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-slate-500">Low</span>
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            <span className="text-slate-500">Med</span>
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-slate-500">High</span>
          </div>
        </div>
      )}
      
      {/* Loading state */}
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  )
}
