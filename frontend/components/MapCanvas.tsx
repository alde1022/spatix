"use client"

import React, { useRef, useEffect, useState, useMemo } from "react"
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

// Free basemaps that actually work
const BASEMAPS = {
  light: {
    name: "Light",
    url: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    preview: "bg-slate-100"
  },
  dark: {
    name: "Dark", 
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    preview: "bg-slate-800"
  },
  streets: {
    name: "Streets",
    url: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json", 
    preview: "bg-amber-100"
  },
  satellite: {
    name: "Satellite",
    // Using ESRI free satellite tiles
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    preview: "bg-emerald-800",
    isRaster: true
  },
}

const QUICK_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b"]

export default function MapCanvas({ geojson, onSave, onClose, saving }: MapCanvasProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [basemap, setBasemap] = useState<keyof typeof BASEMAPS>("light")
  const [featureColor, setFeatureColor] = useState("#3b82f6")
  const [fillOpacity, setFillOpacity] = useState(0.6)
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [savedMapUrl, setSavedMapUrl] = useState<string | null>(null)

  // Store geojson in ref to access in callbacks
  const geojsonRef = useRef(geojson)
  geojsonRef.current = geojson

  // Store style settings in refs for callbacks
  const styleRef = useRef({ featureColor, fillOpacity, strokeWidth })
  styleRef.current = { featureColor, fillOpacity, strokeWidth }

  // Count features
  const featureCount = useMemo(() => {
    if (!geojson) return { points: 0, lines: 0, polygons: 0, total: 0 }
    const features = geojson.features || [geojson]
    let points = 0, lines = 0, polygons = 0
    features.forEach((f: any) => {
      const type = f.geometry?.type || f.type
      if (type === "Point" || type === "MultiPoint") points++
      else if (type === "LineString" || type === "MultiLineString") lines++
      else if (type === "Polygon" || type === "MultiPolygon") polygons++
    })
    return { points, lines, polygons, total: points + lines + polygons }
  }, [geojson])

  // Add data layers function
  const addDataLayers = () => {
    if (!map.current || !geojsonRef.current) return
    
    const m = map.current
    const { featureColor, fillOpacity, strokeWidth } = styleRef.current
    
    // Remove existing layers
    const layerIds = ["geojson-fill", "geojson-line", "geojson-point-stroke", "geojson-point"]
    layerIds.forEach(id => {
      if (m.getLayer(id)) m.removeLayer(id)
    })
    if (m.getSource("geojson-data")) m.removeSource("geojson-data")

    // Add source
    m.addSource("geojson-data", { type: "geojson", data: geojsonRef.current })

    // Polygon fills
    m.addLayer({
      id: "geojson-fill",
      type: "fill",
      source: "geojson-data",
      paint: { 
        "fill-color": featureColor, 
        "fill-opacity": fillOpacity 
      },
      filter: ["==", "$type", "Polygon"]
    })

    // Lines (also outlines polygons)
    m.addLayer({
      id: "geojson-line",
      type: "line",
      source: "geojson-data",
      paint: { 
        "line-color": featureColor, 
        "line-width": strokeWidth,
        "line-opacity": Math.min(1, fillOpacity + 0.3),
        "line-cap": "round",
        "line-join": "round"
      }
    })

    // Point strokes (white outline)
    m.addLayer({
      id: "geojson-point-stroke",
      type: "circle",
      source: "geojson-data",
      paint: {
        "circle-color": "#ffffff",
        "circle-radius": 8,
        "circle-opacity": fillOpacity,
      },
      filter: ["==", "$type", "Point"]
    })

    // Points
    m.addLayer({
      id: "geojson-point",
      type: "circle",
      source: "geojson-data",
      paint: {
        "circle-color": featureColor,
        "circle-radius": 6,
        "circle-opacity": fillOpacity,
      },
      filter: ["==", "$type", "Point"]
    })
  }

  // Fit to bounds
  const fitToBounds = () => {
    if (!map.current || !geojsonRef.current) return
    try {
      const bounds = new maplibregl.LngLatBounds()
      const addCoords = (coords: any) => {
        if (typeof coords[0] === "number") bounds.extend(coords as [number, number])
        else coords.forEach(addCoords)
      }
      const features = geojsonRef.current.features || [geojsonRef.current]
      features.forEach((f: any) => {
        if (f.geometry?.coordinates) addCoords(f.geometry.coordinates)
      })
      if (!bounds.isEmpty()) {
        map.current.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 })
      }
    } catch (e) {
      console.error("Error fitting bounds:", e)
    }
  }

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const style = BASEMAPS[basemap].isRaster 
      ? createRasterStyle(BASEMAPS[basemap].url)
      : BASEMAPS[basemap].url

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: style,
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    })

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")
    map.current.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), "bottom-left")
    
    map.current.on("load", () => {
      setLoaded(true)
      addDataLayers()
      fitToBounds()
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [])

  // Create raster style for satellite
  const createRasterStyle = (tileUrl: string) => ({
    version: 8 as const,
    sources: {
      "raster-tiles": {
        type: "raster" as const,
        tiles: [tileUrl],
        tileSize: 256,
      }
    },
    layers: [{
      id: "raster-layer",
      type: "raster" as const,
      source: "raster-tiles",
    }]
  })

  // Change basemap - re-add layers after style loads
  useEffect(() => {
    if (!map.current || !loaded) return
    
    const style = BASEMAPS[basemap].isRaster 
      ? createRasterStyle(BASEMAPS[basemap].url)
      : BASEMAPS[basemap].url

    map.current.setStyle(style)
    
    // Re-add data layers after new style loads
    map.current.once("style.load", () => {
      addDataLayers()
    })
  }, [basemap])

  // Update paint properties when style changes
  useEffect(() => {
    if (!map.current || !loaded) return
    const m = map.current
    
    try {
      if (m.getLayer("geojson-fill")) {
        m.setPaintProperty("geojson-fill", "fill-color", featureColor)
        m.setPaintProperty("geojson-fill", "fill-opacity", fillOpacity)
      }
      if (m.getLayer("geojson-line")) {
        m.setPaintProperty("geojson-line", "line-color", featureColor)
        m.setPaintProperty("geojson-line", "line-width", strokeWidth)
        m.setPaintProperty("geojson-line", "line-opacity", Math.min(1, fillOpacity + 0.3))
      }
      if (m.getLayer("geojson-point")) {
        m.setPaintProperty("geojson-point", "circle-color", featureColor)
        m.setPaintProperty("geojson-point", "circle-opacity", fillOpacity)
      }
      if (m.getLayer("geojson-point-stroke")) {
        m.setPaintProperty("geojson-point-stroke", "circle-opacity", fillOpacity)
      }
    } catch (e) {
      // Layer might not exist yet
    }
  }, [featureColor, fillOpacity, strokeWidth, loaded])

  const handleSave = async () => {
    if (!map.current || !onSave) return
    const center = map.current.getCenter()
    
    // Call parent save handler
    onSave({ 
      basemap, 
      featureColor, 
      fillOpacity, 
      center: [center.lng, center.lat], 
      zoom: map.current.getZoom(), 
      geojson 
    })
  }

  // Receive saved URL from parent
  useEffect(() => {
    // Listen for saved URL via custom event or check localStorage
    const checkSaved = () => {
      const url = localStorage.getItem('spatix_last_saved_url')
      if (url) setSavedMapUrl(url)
    }
    window.addEventListener('spatix_map_saved', checkSaved)
    return () => window.removeEventListener('spatix_map_saved', checkSaved)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-80" : "w-0"} transition-all duration-300 overflow-hidden bg-white flex flex-col shadow-2xl`}>
        {/* Header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm">🗺️</span>
              </div>
              <span className="font-bold text-slate-900">Style Editor</span>
            </div>
          </div>
          <div className="flex gap-3 mt-2 text-xs text-slate-500">
            {featureCount.points > 0 && <span>{featureCount.points} point{featureCount.points !== 1 ? 's' : ''}</span>}
            {featureCount.lines > 0 && <span>{featureCount.lines} line{featureCount.lines !== 1 ? 's' : ''}</span>}
            {featureCount.polygons > 0 && <span>{featureCount.polygons} polygon{featureCount.polygons !== 1 ? 's' : ''}</span>}
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 overflow-y-auto">
          {/* Basemap */}
          <div className="p-5 border-b border-slate-100">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Base Map</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(BASEMAPS).map(([key, { name, preview }]) => (
                <button
                  key={key}
                  onClick={() => setBasemap(key as keyof typeof BASEMAPS)}
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
                className="flex-1 px-3 py-2 bg-slate-100 rounded-lg text-sm font-mono text-slate-700 border-0 focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Opacity & Stroke */}
          <div className="p-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Opacity
            </label>
            <div className="flex items-center gap-3 mb-5">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={fillOpacity}
                onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
              />
              <span className="text-sm font-medium text-slate-700 w-12 text-right">
                {Math.round(fillOpacity * 100)}%
              </span>
            </div>

            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              Stroke Width
            </label>
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
              <span className="text-sm font-medium text-slate-700 w-12 text-right">
                {strokeWidth}px
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 space-y-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 bg-brand-600 text-white rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-600/25 hover:shadow-xl flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Saving...
              </>
            ) : (
              <>
                <span>✓</span> Save & Get Link
              </>
            )}
          </button>
          {onClose && (
            <button onClick={onClose} className="w-full py-2.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
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

      {/* Map */}
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
