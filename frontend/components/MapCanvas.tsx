"use client"

import React, { useRef, useEffect, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

interface MapCanvasProps {
  geojson: any
  onSave?: (config: MapConfig) => void
  onClose?: () => void
  saving?: boolean
}

export interface MapConfig {
  basemap: string
  featureColor: string
  fillOpacity: number
  center: [number, number]
  zoom: number
  geojson: any
}

const BASEMAPS = {
  light: {
    name: "Light",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    icon: "☀️"
  },
  dark: {
    name: "Dark",
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    icon: "🌙"
  },
  satellite: {
    name: "Satellite",
    url: "https://api.maptiler.com/maps/hybrid/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL",
    icon: "🛰️"
  },
  streets: {
    name: "Streets",
    url: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    icon: "🗺️"
  }
}

const PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
]

export default function MapCanvas({ geojson, onSave, onClose, saving }: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [basemap, setBasemap] = useState<keyof typeof BASEMAPS>("light")
  const [featureColor, setFeatureColor] = useState("#3b82f6")
  const [fillOpacity, setFillOpacity] = useState(0.3)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAPS[basemap].url,
      center: [0, 20],
      zoom: 2,
    })

    map.current.addControl(new maplibregl.NavigationControl(), "top-right")
    map.current.addControl(new maplibregl.ScaleControl(), "bottom-left")
    map.current.on("load", () => setLoaded(true))

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Add GeoJSON layer when map loads
  useEffect(() => {
    if (!map.current || !loaded || !geojson) return

    const addLayers = () => {
      if (!map.current) return
      
      // Remove existing
      if (map.current.getLayer("geojson-fill")) map.current.removeLayer("geojson-fill")
      if (map.current.getLayer("geojson-line")) map.current.removeLayer("geojson-line")
      if (map.current.getLayer("geojson-point")) map.current.removeLayer("geojson-point")
      if (map.current.getSource("geojson-data")) map.current.removeSource("geojson-data")

      map.current.addSource("geojson-data", { type: "geojson", data: geojson })

      map.current.addLayer({
        id: "geojson-fill",
        type: "fill",
        source: "geojson-data",
        paint: { "fill-color": featureColor, "fill-opacity": fillOpacity },
        filter: ["==", "$type", "Polygon"]
      })

      map.current.addLayer({
        id: "geojson-line",
        type: "line",
        source: "geojson-data",
        paint: { "line-color": featureColor, "line-width": 2 }
      })

      map.current.addLayer({
        id: "geojson-point",
        type: "circle",
        source: "geojson-data",
        paint: {
          "circle-color": featureColor,
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        },
        filter: ["==", "$type", "Point"]
      })

      // Fit bounds
      try {
        const bounds = new maplibregl.LngLatBounds()
        const addCoords = (coords: any) => {
          if (typeof coords[0] === "number") {
            bounds.extend(coords as [number, number])
          } else {
            coords.forEach(addCoords)
          }
        }
        
        if (geojson.type === "FeatureCollection") {
          geojson.features.forEach((f: any) => {
            if (f.geometry?.coordinates) addCoords(f.geometry.coordinates)
          })
        } else if (geojson.geometry?.coordinates) {
          addCoords(geojson.geometry.coordinates)
        } else if (geojson.coordinates) {
          addCoords(geojson.coordinates)
        }

        if (!bounds.isEmpty()) {
          map.current.fitBounds(bounds, { padding: 50, maxZoom: 15 })
        }
      } catch (e) {
        console.error("Error fitting bounds:", e)
      }
    }

    addLayers()

    // Popup on click
    const onClick = (e: any) => {
      if (!e.features?.length) return
      const props = e.features[0].properties
      if (!props || Object.keys(props).length === 0) return

      const html = Object.entries(props)
        .filter(([_, v]) => v !== null && v !== undefined)
        .slice(0, 8)
        .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
        .join("<br>")

      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<div class="text-sm">${html}</div>`)
        .addTo(map.current!)
    }

    map.current.on("click", "geojson-fill", onClick)
    map.current.on("click", "geojson-line", onClick)
    map.current.on("click", "geojson-point", onClick)

  }, [loaded, geojson])

  // Update style when basemap changes
  useEffect(() => {
    if (!map.current || !loaded) return
    
    const center = map.current.getCenter()
    const zoom = map.current.getZoom()
    
    map.current.setStyle(BASEMAPS[basemap].url)
    
    map.current.once("style.load", () => {
      if (!map.current || !geojson) return
      
      map.current.addSource("geojson-data", { type: "geojson", data: geojson })

      map.current.addLayer({
        id: "geojson-fill",
        type: "fill",
        source: "geojson-data",
        paint: { "fill-color": featureColor, "fill-opacity": fillOpacity },
        filter: ["==", "$type", "Polygon"]
      })

      map.current.addLayer({
        id: "geojson-line",
        type: "line",
        source: "geojson-data",
        paint: { "line-color": featureColor, "line-width": 2 }
      })

      map.current.addLayer({
        id: "geojson-point",
        type: "circle",
        source: "geojson-data",
        paint: {
          "circle-color": featureColor,
          "circle-radius": 6,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        },
        filter: ["==", "$type", "Point"]
      })
      
      map.current.setCenter(center)
      map.current.setZoom(zoom)
    })
  }, [basemap])

  // Update colors when changed
  useEffect(() => {
    if (!map.current || !loaded) return
    
    if (map.current.getLayer("geojson-fill")) {
      map.current.setPaintProperty("geojson-fill", "fill-color", featureColor)
      map.current.setPaintProperty("geojson-fill", "fill-opacity", fillOpacity)
    }
    if (map.current.getLayer("geojson-line")) {
      map.current.setPaintProperty("geojson-line", "line-color", featureColor)
    }
    if (map.current.getLayer("geojson-point")) {
      map.current.setPaintProperty("geojson-point", "circle-color", featureColor)
    }
  }, [featureColor, fillOpacity, loaded])

  const handleSave = () => {
    if (!map.current || !onSave) return
    const center = map.current.getCenter()
    onSave({
      basemap,
      featureColor,
      fillOpacity,
      center: [center.lng, center.lat],
      zoom: map.current.getZoom(),
      geojson
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-72" : "w-0"} transition-all duration-300 overflow-hidden bg-white border-r border-slate-200 flex flex-col`}>
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🗺️</span>
            <span className="font-bold text-slate-900">MapCanvas</span>
          </div>
          <p className="text-sm text-slate-500">Style your map</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Basemap Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Base Map</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(BASEMAPS).map(([key, { name, icon }]) => (
                <button
                  key={key}
                  onClick={() => setBasemap(key as keyof typeof BASEMAPS)}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                    basemap === key
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <span className="text-sm font-medium">{name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Feature Color */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Feature Color</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setFeatureColor(color)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                    featureColor === color ? "border-slate-800 scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={featureColor}
                onChange={(e) => setFeatureColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer"
              />
              <input
                type="text"
                value={featureColor}
                onChange={(e) => setFeatureColor(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
          </div>

          {/* Fill Opacity */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Fill Opacity: {Math.round(fillOpacity * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={fillOpacity}
              onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
            />
          </div>
        </div>

        {/* Save Button */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
                Saving...
              </>
            ) : (
              <>💾 Save & Share</>
            )}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="w-full py-2 text-slate-600 hover:text-slate-800 text-sm"
            >
              ← Back to upload
            </button>
          )}
        </div>
      </div>

      {/* Toggle sidebar button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-4 z-10 bg-white shadow-lg rounded-lg p-2 hover:bg-slate-50"
        style={{ left: sidebarOpen ? "calc(18rem + 1rem)" : "1rem" }}
      >
        {sidebarOpen ? "◀" : "▶"}
      </button>

      {/* Map */}
      <div ref={mapContainer} className="flex-1" />

      {/* Close button on map */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-white shadow-lg rounded-full w-10 h-10 flex items-center justify-center hover:bg-slate-50 text-xl"
        >
          ✕
        </button>
      )}
    </div>
  )
}
