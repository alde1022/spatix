"use client"

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react"
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

// Free basemaps
const BASEMAPS: Record<string, { name: string; style: any; preview: string }> = {
  light: {
    name: "Light",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    preview: "bg-slate-100"
  },
  dark: {
    name: "Dark", 
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    preview: "bg-slate-800"
  },
  streets: {
    name: "Streets",
    style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json", 
    preview: "bg-amber-100"
  },
  satellite: {
    name: "Satellite",
    style: {
      version: 8,
      sources: {
        "satellite": {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
        }
      },
      layers: [{ id: "satellite-layer", type: "raster", source: "satellite" }]
    },
    preview: "bg-emerald-800"
  },
}

const QUICK_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b"]

export default function MapCanvas({ geojson, onSave, onClose, saving }: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [basemap, setBasemap] = useState<string>("light")
  const [featureColor, setFeatureColor] = useState("#3b82f6")
  const [fillOpacity, setFillOpacity] = useState(0.8)
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Feature counts
  const featureCount = useMemo(() => {
    if (!geojson) return { points: 0, lines: 0, polygons: 0, total: 0 }
    const features = geojson.features || [geojson]
    let points = 0, lines = 0, polygons = 0
    features.forEach((f: any) => {
      const type = f.geometry?.type
      if (type === "Point" || type === "MultiPoint") points++
      else if (type === "LineString" || type === "MultiLineString") lines++
      else if (type === "Polygon" || type === "MultiPolygon") polygons++
    })
    return { points, lines, polygons, total: points + lines + polygons }
  }, [geojson])

  // Add data layers to map
  const addDataLayers = useCallback(() => {
    const m = map.current
    if (!m || !geojson) return

    // Remove existing layers first
    const layerIds = ["data-fill", "data-line", "data-point-outline", "data-point"]
    layerIds.forEach(id => {
      if (m.getLayer(id)) m.removeLayer(id)
    })
    if (m.getSource("data")) m.removeSource("data")

    // Add source
    m.addSource("data", { type: "geojson", data: geojson })

    // Polygon fill
    m.addLayer({
      id: "data-fill",
      type: "fill",
      source: "data",
      filter: ["==", "$type", "Polygon"],
      paint: {
        "fill-color": featureColor,
        "fill-opacity": fillOpacity * 0.7
      }
    })

    // Lines (including polygon outlines)
    m.addLayer({
      id: "data-line",
      type: "line",
      source: "data",
      paint: {
        "line-color": featureColor,
        "line-width": strokeWidth,
        "line-opacity": fillOpacity
      }
    })

    // Point outline (white)
    m.addLayer({
      id: "data-point-outline",
      type: "circle",
      source: "data",
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 7,
        "circle-color": "#ffffff",
        "circle-opacity": fillOpacity
      }
    })

    // Points
    m.addLayer({
      id: "data-point",
      type: "circle",
      source: "data",
      filter: ["==", "$type", "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": featureColor,
        "circle-opacity": fillOpacity
      }
    })

    console.log("Data layers added successfully")
  }, [geojson, featureColor, fillOpacity, strokeWidth])

  // Fit map to data bounds
  const fitBounds = useCallback(() => {
    const m = map.current
    if (!m || !geojson) return

    try {
      const bounds = new maplibregl.LngLatBounds()
      const addCoords = (coords: any) => {
        if (typeof coords[0] === "number") bounds.extend(coords as [number, number])
        else coords.forEach(addCoords)
      }
      const features = geojson.features || [geojson]
      features.forEach((f: any) => {
        if (f.geometry?.coordinates) addCoords(f.geometry.coordinates)
      })
      if (!bounds.isEmpty()) {
        m.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 500 })
      }
    } catch (e) {
      console.error("fitBounds error:", e)
    }
  }, [geojson])

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAPS[basemap].style,
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    })

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), "bottom-left")

    m.on("load", () => {
      map.current = m
      setMapReady(true)
      addDataLayers()
      // fitBounds will be called by the useEffect when mapReady becomes true
    })

    return () => {
      m.remove()
      map.current = null
      setMapReady(false)
    }
  }, []) // Only run once on mount

  // Fit to bounds when geojson changes OR when map becomes ready
  useEffect(() => {
    const m = map.current
    if (!m || !mapReady || !geojson) return
    
    // Calculate bounds from geojson
    const calculateBounds = () => {
      const bounds = new maplibregl.LngLatBounds()
      const addCoords = (coords: any) => {
        if (Array.isArray(coords) && typeof coords[0] === "number" && coords.length >= 2) {
          // coords is [lng, lat]
          bounds.extend([coords[0], coords[1]])
        } else if (Array.isArray(coords)) {
          coords.forEach(addCoords)
        }
      }
      const features = geojson.features || [geojson]
      features.forEach((f: any) => {
        if (f.geometry?.coordinates) addCoords(f.geometry.coordinates)
      })
      return bounds
    }
    
    const bounds = calculateBounds()
    if (bounds.isEmpty()) return
    
    // Function to perform the zoom
    const doZoom = () => {
      if (!map.current) return
      try {
        map.current.fitBounds(bounds, { 
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          maxZoom: 14, 
          duration: 800 
        })
      } catch (e) {
        console.error("fitBounds error:", e)
      }
    }
    
    // Try immediately
    doZoom()
    
    // Also try after map is idle (ensures style is loaded)
    const onIdle = () => {
      doZoom()
      m.off("idle", onIdle)
    }
    m.on("idle", onIdle)
    
    // Fallback timeouts
    const t1 = setTimeout(doZoom, 200)
    const t2 = setTimeout(doZoom, 600)
    const t3 = setTimeout(doZoom, 1000)
    
    return () => {
      m.off("idle", onIdle)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [geojson, mapReady])

  // Handle basemap changes
  useEffect(() => {
    const m = map.current
    if (!m || !mapReady) return

    const newStyle = BASEMAPS[basemap].style
    
    // Store current center/zoom
    const center = m.getCenter()
    const zoom = m.getZoom()

    m.setStyle(newStyle)

    // Wait for style to load, then re-add layers
    const onStyleLoad = () => {
      // Restore view
      m.setCenter(center)
      m.setZoom(zoom)
      // Re-add data layers
      addDataLayers()
    }

    m.once("styledata", onStyleLoad)

    // Fallback: if styledata doesn't fire, use timeout
    const timeout = setTimeout(() => {
      if (m.isStyleLoaded()) {
        addDataLayers()
      }
    }, 500)

    return () => {
      clearTimeout(timeout)
      m.off("styledata", onStyleLoad)
    }
  }, [basemap, mapReady, addDataLayers])

  // Update layer styles when settings change (not basemap)
  useEffect(() => {
    const m = map.current
    if (!m || !mapReady) return

    try {
      if (m.getLayer("data-fill")) {
        m.setPaintProperty("data-fill", "fill-color", featureColor)
        m.setPaintProperty("data-fill", "fill-opacity", fillOpacity * 0.7)
      }
      if (m.getLayer("data-line")) {
        m.setPaintProperty("data-line", "line-color", featureColor)
        m.setPaintProperty("data-line", "line-width", strokeWidth)
        m.setPaintProperty("data-line", "line-opacity", fillOpacity)
      }
      if (m.getLayer("data-point")) {
        m.setPaintProperty("data-point", "circle-color", featureColor)
        m.setPaintProperty("data-point", "circle-opacity", fillOpacity)
      }
      if (m.getLayer("data-point-outline")) {
        m.setPaintProperty("data-point-outline", "circle-opacity", fillOpacity)
      }
    } catch (e) {
      // Layers may not exist yet
    }
  }, [featureColor, fillOpacity, strokeWidth, mapReady])

  const handleSave = () => {
    const m = map.current
    if (!m || !onSave) return
    const center = m.getCenter()
    onSave({
      basemap,
      featureColor,
      fillOpacity,
      center: [center.lng, center.lat],
      zoom: m.getZoom(),
      geojson
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-80" : "w-0"} transition-all duration-300 overflow-hidden bg-white flex flex-col shadow-2xl`}>
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">🗺️</span>
            </div>
            <span className="font-bold text-slate-900">Style Editor</span>
          </div>
          <div className="flex gap-3 mt-2 text-xs text-slate-500">
            {featureCount.points > 0 && <span>{featureCount.points} point{featureCount.points !== 1 ? 's' : ''}</span>}
            {featureCount.lines > 0 && <span>{featureCount.lines} line{featureCount.lines !== 1 ? 's' : ''}</span>}
            {featureCount.polygons > 0 && <span>{featureCount.polygons} polygon{featureCount.polygons !== 1 ? 's' : ''}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Basemap */}
          <div className="p-5 border-b border-slate-100">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Base Map</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(BASEMAPS).map(([key, { name, preview }]) => (
                <button
                  key={key}
                  onClick={() => setBasemap(key)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                    basemap === key ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className={`w-full h-8 rounded-lg ${preview}`}></div>
                  <span className="text-xs font-medium text-slate-700">{name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="p-5 border-b border-slate-100">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Color</label>
            <div className="grid grid-cols-8 gap-1.5 mb-4">
              {QUICK_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setFeatureColor(color)}
                  className={`aspect-square rounded-lg border-2 transition-all hover:scale-110 ${
                    featureColor === color ? "border-slate-900 scale-110 shadow-lg" : "border-transparent"
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
                className="w-12 h-10 rounded-lg cursor-pointer border-0"
              />
              <input
                type="text"
                value={featureColor}
                onChange={(e) => setFeatureColor(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono text-slate-700 border-0"
              />
            </div>
          </div>

          {/* Opacity & Stroke */}
          <div className="p-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Opacity</label>
            <div className="flex items-center gap-3 mb-5">
              <input
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={fillOpacity}
                onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
              />
              <span className="text-sm font-medium text-slate-700 w-12 text-right">{Math.round(fillOpacity * 100)}%</span>
            </div>

            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Stroke Width</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="8"
                step="0.5"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
              />
              <span className="text-sm font-medium text-slate-700 w-12 text-right">{strokeWidth}px</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Saving...
              </>
            ) : (
              <>✓ Save & Get Link</>
            )}
          </button>
          {onClose && (
            <button onClick={onClose} className="w-full py-2.5 text-slate-500 hover:text-slate-700 text-sm font-medium">
              ← Start over
            </button>
          )}
        </div>
      </div>

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute top-4 z-10 bg-white shadow-lg rounded-xl p-2.5 hover:bg-slate-50 transition-all"
        style={{ left: sidebarOpen ? "calc(20rem + 1rem)" : "1rem" }}
      >
        <svg className={`w-5 h-5 text-slate-600 transition-transform ${sidebarOpen ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Map container */}
      <div ref={mapContainer} className="flex-1" />

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur shadow-lg rounded-xl w-10 h-10 flex items-center justify-center hover:bg-white transition-all"
        >
          <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
