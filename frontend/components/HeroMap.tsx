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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapContainer.current) {
      setError("No container")
      return
    }
    if (map.current) return

    try {
      const m = new maplibregl.Map({
        container: mapContainer.current,
        style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
        center: [-122.42, 37.77],
        zoom: 12,
        attributionControl: false,
      })
      
      m.scrollZoom.disable()
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")

      m.on("load", () => {
        map.current = m
        
        const geojson: GeoJSON.FeatureCollection = {
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

        m.addSource("coffee", { type: "geojson", data: geojson })

        m.addLayer({
          id: "layer-points",
          type: "circle",
          source: "coffee",
          paint: { "circle-radius": 12, "circle-color": "#6366f1", "circle-stroke-width": 3, "circle-stroke-color": "#ffffff" }
        })

        m.addLayer({
          id: "layer-bubbles",
          type: "circle",
          source: "coffee",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": ["*", ["get", "value"], 0.5],
            "circle-color": ["interpolate", ["linear"], ["get", "value"], 25, "#22c55e", 45, "#eab308", 60, "#ef4444"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.8
          }
        })

        m.addLayer({
          id: "layer-heatmap",
          type: "heatmap",
          source: "coffee",
          layout: { visibility: "none" },
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "value"], 20, 0, 60, 1],
            "heatmap-intensity": 1.5,
            "heatmap-radius": 45,
            "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.2, "#312e81", 0.4, "#4f46e5", 0.6, "#818cf8", 0.8, "#c4b5fd", 1, "#fde047"]
          }
        })

        setMapLoaded(true)
      })

      m.on("error", (e) => {
        setError(e.error?.message || "Map error")
      })

    } catch (e: any) {
      setError(e.message || "Failed to init map")
    }

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !mapLoaded) return
    
    ["layer-points", "layer-bubbles", "layer-heatmap"].forEach(id => {
      if (m.getLayer(id)) {
        m.setLayoutProperty(id, "visibility", id === `layer-${vizType}` ? "visible" : "none")
      }
    })
  }, [vizType, mapLoaded])

  if (error) {
    return (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-red-50 text-red-600 text-sm">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[300px] relative bg-slate-100">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" style={{ minHeight: '300px' }} />
      
      {mapLoaded && (
        <>
          <div className="absolute top-3 left-3 flex gap-1 bg-white/95 backdrop-blur rounded-lg p-1 shadow-lg z-10">
            {(["points", "bubbles", "heatmap"] as VizType[]).map((id) => (
              <button
                key={id}
                onClick={() => setVizType(id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize ${
                  vizType === id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {id}
              </button>
            ))}
          </div>

          <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-lg px-3 py-1.5 shadow-lg z-10 text-xs">
            <span className="font-semibold text-slate-800">12 Coffee Shops</span>
            <span className="text-slate-400 ml-1">· SF</span>
          </div>
        </>
      )}
      
      {!mapLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  )
}
