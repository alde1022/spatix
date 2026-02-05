"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.spatix.io"

// Sample datasets for demo
const SAMPLE_DATASETS = [
  {
    id: "earthquakes",
    name: "Global Earthquakes",
    description: "2,000+ seismic events worldwide",
    icon: "🌍",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson"
  },
  {
    id: "airports",
    name: "World Airports",
    description: "Major international airports",
    icon: "✈️",
    url: "https://raw.githubusercontent.com/datasets/airport-codes/master/data/airport-codes.csv"
  },
]

const BASEMAPS = {
  dark: { name: "Dark", style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" },
  light: { name: "Light", style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" },
  streets: { name: "Streets", style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json" },
  satellite: { 
    name: "Satellite", 
    style: {
      version: 8,
      sources: { satellite: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256 }},
      layers: [{ id: "satellite", type: "raster", source: "satellite" }]
    }
  },
}

const COLORS = ["#00d1b2", "#ff6b6b", "#4ecdc4", "#f7dc6f", "#bb8fce", "#85c1e9", "#f8b500", "#e74c3c"]

interface Layer {
  id: string
  name: string
  visible: boolean
  color: string
  opacity: number
  data: any
  type: "point" | "line" | "polygon"
}

export default function MapsPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [basemap, setBasemap] = useState<string>("dark")
  const [layers, setLayers] = useState<Layer[]>([])
  const [activePanel, setActivePanel] = useState<"layers" | "add" | null>("add")
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAPS[basemap].style as any,
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
    })

    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right")
    m.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), "bottom-left")

    m.on("load", () => {
      map.current = m
      setMapReady(true)
    })

    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  // Handle basemap changes
  useEffect(() => {
    const m = map.current
    if (!m || !mapReady) return

    m.setStyle(BASEMAPS[basemap].style as any)
    m.once("styledata", () => {
      // Re-add all layers
      layers.forEach(layer => {
        if (layer.visible) addLayerToMap(layer)
      })
    })
  }, [basemap, mapReady])

  // Add layer to map
  const addLayerToMap = useCallback((layer: Layer) => {
    const m = map.current
    if (!m) return

    const sourceId = `source-${layer.id}`
    const layerId = `layer-${layer.id}`

    // Remove if exists
    if (m.getLayer(layerId)) m.removeLayer(layerId)
    if (m.getLayer(`${layerId}-outline`)) m.removeLayer(`${layerId}-outline`)
    if (m.getSource(sourceId)) m.removeSource(sourceId)

    if (!layer.visible) return

    m.addSource(sourceId, { type: "geojson", data: layer.data })

    if (layer.type === "point") {
      m.addLayer({
        id: `${layerId}-outline`,
        type: "circle",
        source: sourceId,
        paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-opacity": layer.opacity }
      })
      m.addLayer({
        id: layerId,
        type: "circle",
        source: sourceId,
        paint: { "circle-radius": 4, "circle-color": layer.color, "circle-opacity": layer.opacity }
      })
    } else if (layer.type === "line") {
      m.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        paint: { "line-color": layer.color, "line-width": 2, "line-opacity": layer.opacity }
      })
    } else {
      m.addLayer({
        id: layerId,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": layer.color, "fill-opacity": layer.opacity * 0.5 }
      })
      m.addLayer({
        id: `${layerId}-outline`,
        type: "line",
        source: sourceId,
        paint: { "line-color": layer.color, "line-width": 1, "line-opacity": layer.opacity }
      })
    }
  }, [])

  // Update layer on map when settings change
  useEffect(() => {
    if (!mapReady) return
    layers.forEach(layer => addLayerToMap(layer))
  }, [layers, mapReady, addLayerToMap])

  // Fit to layer bounds
  const fitToLayer = (layer: Layer) => {
    const m = map.current
    if (!m || !layer.data) return

    try {
      const bounds = new maplibregl.LngLatBounds()
      const addCoords = (coords: any) => {
        if (typeof coords[0] === "number") bounds.extend(coords as [number, number])
        else coords.forEach(addCoords)
      }
      const features = layer.data.features || [layer.data]
      features.forEach((f: any) => {
        if (f.geometry?.coordinates) addCoords(f.geometry.coordinates)
      })
      if (!bounds.isEmpty()) {
        m.fitBounds(bounds, { padding: 50, maxZoom: 12, duration: 1000 })
      }
    } catch (e) {}
  }

  // Detect geometry type
  const detectType = (geojson: any): "point" | "line" | "polygon" => {
    const features = geojson.features || [geojson]
    const types = features.map((f: any) => f.geometry?.type).filter(Boolean)
    if (types.some((t: string) => t.includes("Polygon"))) return "polygon"
    if (types.some((t: string) => t.includes("Line"))) return "line"
    return "point"
  }

  // Process uploaded file
  const processFile = async (file: File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch(`${API_URL}/analyze?include_preview=true`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) throw new Error("Failed to process file")
      
      const data = await response.json()
      if (!data.preview_geojson) throw new Error("No geographic data found")

      const newLayer: Layer = {
        id: Date.now().toString(),
        name: file.name.replace(/\.[^/.]+$/, ""),
        visible: true,
        color: COLORS[layers.length % COLORS.length],
        opacity: 0.8,
        data: data.preview_geojson,
        type: detectType(data.preview_geojson)
      }

      setLayers(prev => [...prev, newLayer])
      setActivePanel("layers")
      
      // Fit to new layer
      setTimeout(() => fitToLayer(newLayer), 100)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  // Load sample dataset
  const loadSample = async (sample: typeof SAMPLE_DATASETS[0]) => {
    setUploading(true)
    try {
      const response = await fetch(sample.url)
      const data = await response.json()

      const newLayer: Layer = {
        id: Date.now().toString(),
        name: sample.name,
        visible: true,
        color: COLORS[layers.length % COLORS.length],
        opacity: 0.8,
        data: data,
        type: detectType(data)
      }

      setLayers(prev => [...prev, newLayer])
      setActivePanel("layers")
      setTimeout(() => fitToLayer(newLayer), 100)
    } catch (err) {
      alert("Failed to load sample")
    } finally {
      setUploading(false)
    }
  }

  // Toggle layer visibility
  const toggleLayer = (id: string) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, visible: !l.visible } : l
    ))
  }

  // Update layer color
  const updateLayerColor = (id: string, color: string) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, color } : l
    ))
  }

  // Update layer opacity
  const updateLayerOpacity = (id: string, opacity: number) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, opacity } : l
    ))
  }

  // Remove layer
  const removeLayer = (id: string) => {
    const m = map.current
    if (m) {
      const layerId = `layer-${id}`
      if (m.getLayer(layerId)) m.removeLayer(layerId)
      if (m.getLayer(`${layerId}-outline`)) m.removeLayer(`${layerId}-outline`)
      if (m.getSource(`source-${id}`)) m.removeSource(`source-${id}`)
    }
    setLayers(prev => prev.filter(l => l.id !== id))
  }

  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  return (
    <div className="h-screen w-screen flex bg-slate-900 overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="p-4 border-b border-slate-800">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <span className="text-white">🗺️</span>
            </div>
            <span className="font-bold text-white text-lg">Spatix</span>
          </Link>
        </div>

        {/* Panel Tabs */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActivePanel("layers")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activePanel === "layers" ? "text-white bg-slate-800" : "text-slate-400 hover:text-white"
            }`}
          >
            Layers ({layers.length})
          </button>
          <button
            onClick={() => setActivePanel("add")}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activePanel === "add" ? "text-white bg-slate-800" : "text-slate-400 hover:text-white"
            }`}
          >
            + Add Data
          </button>
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto">
          {activePanel === "layers" && (
            <div className="p-4 space-y-3">
              {layers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-500 text-sm">No layers yet</p>
                  <button
                    onClick={() => setActivePanel("add")}
                    className="mt-3 text-brand-400 text-sm hover:text-brand-300"
                  >
                    + Add your first layer
                  </button>
                </div>
              ) : (
                layers.map(layer => (
                  <div key={layer.id} className="bg-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleLayer(layer.id)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            layer.visible ? "bg-brand-500 border-brand-500" : "border-slate-600"
                          }`}
                        >
                          {layer.visible && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <span className="text-white text-sm font-medium truncate max-w-[140px]">{layer.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => fitToLayer(layer)}
                          className="p-1.5 text-slate-400 hover:text-white transition-colors"
                          title="Zoom to layer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeLayer(layer.id)}
                          className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                          title="Remove layer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Color */}
                    <div className="mb-3">
                      <label className="block text-xs text-slate-500 mb-2">Color</label>
                      <div className="flex gap-1">
                        {COLORS.map(color => (
                          <button
                            key={color}
                            onClick={() => updateLayerColor(layer.id, color)}
                            className={`w-6 h-6 rounded-md transition-transform hover:scale-110 ${
                              layer.color === color ? "ring-2 ring-white ring-offset-2 ring-offset-slate-800" : ""
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Opacity */}
                    <div>
                      <label className="block text-xs text-slate-500 mb-2">Opacity</label>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={layer.opacity}
                        onChange={(e) => updateLayerOpacity(layer.id, parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activePanel === "add" && (
            <div className="p-4 space-y-4">
              {/* Upload zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  dragOver 
                    ? "border-brand-500 bg-brand-500/10" 
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".geojson,.json,.csv,.kml,.gpx,.zip"
                  onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                />
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-slate-400">
                    <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </div>
                ) : (
                  <>
                    <div className="text-3xl mb-2">📂</div>
                    <p className="text-white text-sm font-medium">Drop file or click to upload</p>
                    <p className="text-slate-500 text-xs mt-1">GeoJSON, Shapefile, KML, CSV, GPX</p>
                  </>
                )}
              </div>

              {/* Sample datasets */}
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Sample Datasets</h3>
                <div className="space-y-2">
                  {SAMPLE_DATASETS.map(sample => (
                    <button
                      key={sample.id}
                      onClick={() => loadSample(sample)}
                      disabled={uploading}
                      className="w-full flex items-center gap-3 p-3 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors text-left disabled:opacity-50"
                    >
                      <span className="text-2xl">{sample.icon}</span>
                      <div>
                        <p className="text-white text-sm font-medium">{sample.name}</p>
                        <p className="text-slate-500 text-xs">{sample.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Basemap selector */}
        <div className="p-4 border-t border-slate-800">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Base Map</label>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.entries(BASEMAPS).map(([key, { name }]) => (
              <button
                key={key}
                onClick={() => setBasemap(key)}
                className={`py-2 text-xs font-medium rounded-lg transition-colors ${
                  basemap === key 
                    ? "bg-brand-500 text-white" 
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Map */}
      <div ref={mapContainer} className="flex-1" />
    </div>
  )
}
