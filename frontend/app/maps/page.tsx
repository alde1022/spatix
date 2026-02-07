"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { MapboxOverlay } from "@deck.gl/mapbox"
import { ScatterplotLayer, ArcLayer, GeoJsonLayer } from "@deck.gl/layers"
import { HexagonLayer, HeatmapLayer } from "@deck.gl/aggregation-layers"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.spatix.io"

// Kepler-inspired color palettes
const COLOR_PALETTES = {
  uber: ["#5A1846", "#900C3F", "#C70039", "#E3611C", "#F1920E", "#FFC300"],
  ice: ["#0d47a1", "#1565c0", "#1e88e5", "#42a5f5", "#64b5f6", "#90caf9"],
  fire: ["#b71c1c", "#c62828", "#d32f2f", "#e53935", "#ef5350", "#ef9a9a"],
  nature: ["#1b5e20", "#2e7d32", "#388e3c", "#43a047", "#66bb6a", "#a5d6a7"],
  sunset: ["#4a148c", "#6a1b9a", "#7b1fa2", "#8e24aa", "#ab47bc", "#ce93d8"],
  ocean: ["#006064", "#00838f", "#0097a7", "#00acc1", "#26c6da", "#80deea"],
}

// Kepler default colors for layers
const LAYER_COLORS = [
  [255, 203, 153], // Peach
  [90, 24, 70],    // Deep purple
  [144, 12, 63],   // Magenta
  [199, 0, 57],    // Red
  [227, 97, 28],   // Orange
  [241, 146, 14],  // Yellow
  [0, 188, 212],   // Cyan
  [76, 175, 80],   // Green
]

// Sample datasets
const SAMPLE_DATASETS = [
  {
    id: "earthquakes",
    name: "Global Earthquakes",
    description: "10,000+ seismic events (past month)",
    icon: "🌍",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson"
  },
  {
    id: "earthquakes-significant",
    name: "Significant Earthquakes",
    description: "Major earthquakes (M4.5+) past month",
    icon: "💥",
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson"
  },
  {
    id: "world-countries",
    name: "World Countries",
    description: "Country boundaries (low res)",
    icon: "🗺️",
    url: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson"
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

type VizType = "point" | "heatmap" | "hexagon" | "arc" | "fill" | "line" | "3d"

interface Layer {
  id: string
  name: string
  visible: boolean
  color: number[]
  opacity: number
  data: any
  type: "point" | "line" | "polygon"
  vizType: VizType
  height?: number
  radius?: number
}


interface SavedMap {
  id: string
  title: string
  url: string
  created_at: string
  views: number
}

export default function MapsPage() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const [demoLoaded, setDemoLoaded] = useState(false)
  const map = useRef<maplibregl.Map | null>(null)
  const deckOverlay = useRef<MapboxOverlay | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [basemap, setBasemap] = useState<string>("dark")
  const [layers, setLayers] = useState<Layer[]>([])
  const [activePanel, setActivePanel] = useState<"layers" | "add" | "history" | null>("add")
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Save & Share state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [savedMapId, setSavedMapId] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [mapTitle, setMapTitle] = useState("")
  const [copiedLink, setCopiedLink] = useState(false)

  // Error toast state
  const [errorToast, setErrorToast] = useState<string | null>(null)

  // My Maps history state
  const [myMaps, setMyMaps] = useState<SavedMap[]>([])
  const [loadingMyMaps, setLoadingMyMaps] = useState(false)
  const [myMapsError, setMyMapsError] = useState<string | null>(null)

  // Load stored email on mount
  useEffect(() => {
    const storedEmail = localStorage.getItem("spatix_save_email")
    if (storedEmail) setEmail(storedEmail)
  }, [])

  // Auto-dismiss error toast
  useEffect(() => {
    if (!errorToast) return
    const t = setTimeout(() => setErrorToast(null), 5000)
    return () => clearTimeout(t)
  }, [errorToast])

  // Fetch my maps when history tab is opened
  const fetchMyMaps = useCallback(async () => {
    const storedEmail = localStorage.getItem("spatix_save_email")
    if (!storedEmail) {
      setMyMaps([])
      return
    }
    setLoadingMyMaps(true)
    setMyMapsError(null)
    try {
      const res = await fetch(\`\${API_URL}/api/maps/by-email?email=\${encodeURIComponent(storedEmail)}\`)
      if (res.ok) {
        const data = await res.json()
        setMyMaps(data.maps || [])
      } else {
        setMyMapsError("Could not load your maps")
      }
    } catch {
      setMyMapsError("Connection failed. Check your network.")
    } finally {
      setLoadingMyMaps(false)
    }
  }, [])

  useEffect(() => {
    if (activePanel === "history") fetchMyMaps()
  }, [activePanel, fetchMyMaps])

  // Save map to backend with email
  const handleSaveMap = async () => {
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return
    if (layers.length === 0) return

    setSaving(true)
    try {
      const allFeatures = layers
        .filter(l => l.visible)
        .flatMap(l => l.data?.features || [])
      const mergedGeojson = { type: "FeatureCollection", features: allFeatures }

      const res = await fetch(\`\${API_URL}/api/map\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: mergedGeojson,
          title: mapTitle || "Untitled Map",
          style: basemap === "dark" ? "dark" : basemap === "satellite" ? "satellite" : "light",
          email: email.trim().toLowerCase(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        const msg = errData?.detail?.message || errData?.detail || "Server error"
        throw new Error(msg)
      }
      const data = await res.json()

      localStorage.setItem("spatix_save_email", email.trim().toLowerCase())
      setSavedUrl(data.url)
      setSavedMapId(data.id)
      setShowSaveModal(false)
      setShowShareModal(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setErrorToast(\`Failed to save map: \${message}\`)
    } finally {
      setSaving(false)
    }
  }

  const copyShareLink = () => {
    if (savedUrl) {
      navigator.clipboard.writeText(savedUrl)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    }
  }

  // Build deck.gl layers
  const deckLayers = useMemo(() => {
    return layers.filter(l => l.visible).flatMap(layer => {
      const features = layer.data?.features || []
      
      // Extract coordinates for point-based layers
      const points = features
        .filter((f: any) => f.geometry?.type === "Point")
        .map((f: any) => ({
          position: f.geometry.coordinates,
          properties: f.properties || {}
        }))

      if (layer.vizType === "heatmap" && layer.type === "point") {
        return new HeatmapLayer({
          id: `heatmap-${layer.id}`,
          data: points,
          getPosition: (d: any) => d.position,
          getWeight: 1,
          radiusPixels: layer.radius || 30,
          intensity: 1,
          threshold: 0.03,
          opacity: layer.opacity,
          colorRange: COLOR_PALETTES.uber.map(c => {
            const hex = c.replace('#', '')
            return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)]
          })
        })
      }

      if (layer.vizType === "hexagon" && layer.type === "point") {
        return new HexagonLayer({
          id: `hexagon-${layer.id}`,
          data: points,
          getPosition: (d: any) => d.position,
          radius: layer.radius || 1000,
          elevationScale: 50,
          extruded: true,
          opacity: layer.opacity,
          colorRange: COLOR_PALETTES.uber.map(c => {
            const hex = c.replace('#', '')
            return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)]
          })
        })
      }

      if (layer.vizType === "point" && layer.type === "point") {
        return new ScatterplotLayer({
          id: `scatter-${layer.id}`,
          data: points,
          getPosition: (d: any) => d.position,
          getFillColor: layer.color,
          getRadius: 5,
          radiusScale: 1,
          radiusMinPixels: 3,
          radiusMaxPixels: 30,
          opacity: layer.opacity,
          stroked: true,
          lineWidthMinPixels: 1,
          getLineColor: [255, 255, 255],
        })
      }

      // GeoJSON layer for lines and polygons
      if (layer.type === "line" || layer.type === "polygon") {
        return new GeoJsonLayer({
          id: `geojson-${layer.id}`,
          data: layer.data,
          filled: layer.type === "polygon",
          stroked: true,
          getFillColor: [...layer.color, Math.floor(layer.opacity * 128)],
          getLineColor: layer.color,
          getLineWidth: 2,
          lineWidthMinPixels: 1,
          extruded: layer.vizType === "3d",
          getElevation: layer.height || 100,
          opacity: layer.opacity,
        })
      }

      return []
    })
  }, [layers])

  // Update deck overlay
  useEffect(() => {
    if (deckOverlay.current) {
      deckOverlay.current.setProps({ layers: deckLayers })
    }
  }, [deckLayers])

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAPS[basemap as keyof typeof BASEMAPS].style as any,
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
      antialias: true,
    })

    m.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right")

    m.on("load", () => {
      // Initialize deck.gl overlay
      deckOverlay.current = new MapboxOverlay({
        interleaved: true,
        layers: []
      })
      m.addControl(deckOverlay.current as any)
      
      map.current = m
      setMapReady(true)
      
      // Check for demo mode (from homepage preview) or example data
      const urlParams = new URLSearchParams(window.location.search)
      const isDemo = urlParams.get('demo') === '1'
      const exampleData = localStorage.getItem('spatix_example_data')
      
      if (isDemo && !demoLoaded) {
        setDemoLoaded(true)
        // Load demo data
        const demoGeojson = {
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: { name: "Blue Bottle Coffee" }, geometry: { type: "Point", coordinates: [-122.4086, 37.7823] }},
            { type: "Feature", properties: { name: "Sightglass Coffee" }, geometry: { type: "Point", coordinates: [-122.4105, 37.7715] }},
            { type: "Feature", properties: { name: "Ritual Coffee" }, geometry: { type: "Point", coordinates: [-122.4215, 37.7565] }},
            { type: "Feature", properties: { name: "Philz Coffee" }, geometry: { type: "Point", coordinates: [-122.4335, 37.7642] }},
            { type: "Feature", properties: { name: "Four Barrel" }, geometry: { type: "Point", coordinates: [-122.4223, 37.7672] }},
            { type: "Feature", properties: { name: "Embarcadero Walk" }, geometry: { type: "LineString", coordinates: [[-122.3932, 37.7956], [-122.3889, 37.7897], [-122.3878, 37.7834], [-122.3901, 37.7765]] }},
            { type: "Feature", properties: { name: "Golden Gate Park" }, geometry: { type: "Polygon", coordinates: [[[-122.5108, 37.7712], [-122.4534, 37.7712], [-122.4534, 37.7654], [-122.5108, 37.7654], [-122.5108, 37.7712]]] }},
          ]
        }
        const layerGroups = splitByGeometryType(demoGeojson, 'SF Demo Data')
        const newLayers: Layer[] = layerGroups.map((group, i) => ({
          id: `demo-${Date.now()}-${i}`,
          name: group.name,
          visible: true,
          color: LAYER_COLORS[i % LAYER_COLORS.length],
          opacity: 0.8,
          data: group.data,
          type: group.type,
          vizType: group.type === "point" ? "point" : group.type === "line" ? "line" : "fill",
          height: 1000,
          radius: 1000
        }))
        setLayers(newLayers)
        setActivePanel("layers")
        setTimeout(() => {
          if (map.current && newLayers[0]?.data) {
            const bounds = new maplibregl.LngLatBounds()
            const addCoords = (coords: any) => {
              if (typeof coords[0] === "number") bounds.extend(coords as [number, number])
              else coords.forEach(addCoords)
            }
            newLayers.forEach(layer => {
              const features = layer.data?.features || []
              features.forEach((f: any) => f.geometry?.coordinates && addCoords(f.geometry.coordinates))
            })
            if (!bounds.isEmpty()) {
              map.current.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 800 })
            }
          }
        }, 300)
      } else if (exampleData) {
        try {
          const { geojson, name } = JSON.parse(exampleData)
          localStorage.removeItem('spatix_example_data') // Clear it
          
          if (geojson) {
            // Add the example data as a layer
            const layerGroups = splitByGeometryType(geojson, name || 'Example')
            const newLayers: Layer[] = layerGroups.map((group, i) => ({
              id: `${Date.now()}-${i}`,
              name: group.name,
              visible: true,
              color: LAYER_COLORS[i % LAYER_COLORS.length],
              opacity: 0.8,
              data: group.data,
              type: group.type,
              vizType: group.type === "point" ? "point" : group.type === "line" ? "line" : "fill",
              height: 1000,
              radius: 1000
            }))
            setLayers(newLayers)
            setActivePanel("layers")
            
            // Fit to bounds
            if (newLayers[0]) {
              setTimeout(() => {
                const layer = newLayers[0]
                if (!layer.data) return
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
                  if (!bounds.isEmpty() && map.current) {
                    map.current.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 800 })
                  }
                } catch (e) {}
              }, 200)
            }
          }
        } catch (e) {
          console.error('Failed to load example data:', e)
        }
      }
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
    m.setStyle(BASEMAPS[basemap as keyof typeof BASEMAPS].style as any)
  }, [basemap, mapReady])

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

  // Split GeoJSON by geometry type
  const splitByGeometryType = (geojson: any, baseName: string) => {
    const features = geojson.features || [geojson]
    const points: any[] = []
    const lines: any[] = []
    const polygons: any[] = []

    features.forEach((f: any) => {
      const type = f.geometry?.type
      if (type === "Point" || type === "MultiPoint") points.push(f)
      else if (type === "LineString" || type === "MultiLineString") lines.push(f)
      else if (type === "Polygon" || type === "MultiPolygon") polygons.push(f)
    })

    const result: { name: string; type: "point" | "line" | "polygon"; data: any }[] = []
    
    if (points.length > 0) {
      result.push({
        name: polygons.length > 0 || lines.length > 0 ? `${baseName} · Points` : baseName,
        type: "point",
        data: { type: "FeatureCollection", features: points }
      })
    }
    if (lines.length > 0) {
      result.push({
        name: points.length > 0 || polygons.length > 0 ? `${baseName} · Lines` : baseName,
        type: "line", 
        data: { type: "FeatureCollection", features: lines }
      })
    }
    if (polygons.length > 0) {
      result.push({
        name: points.length > 0 || lines.length > 0 ? `${baseName} · Polygons` : baseName,
        type: "polygon",
        data: { type: "FeatureCollection", features: polygons }
      })
    }

    return result
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

      const baseName = file.name.replace(/\.[^/.]+$/, "")
      const layerGroups = splitByGeometryType(data.preview_geojson, baseName)

      if (layerGroups.length === 0) throw new Error("No valid geometry found")

      const newLayers: Layer[] = layerGroups.map((group, i) => ({
        id: `${Date.now()}-${i}`,
        name: group.name,
        visible: true,
        color: LAYER_COLORS[(layers.length + i) % LAYER_COLORS.length],
        opacity: 0.8,
        data: group.data,
        type: group.type,
        vizType: group.type === "point" ? "point" : group.type === "line" ? "line" : "fill",
        height: 1000,
        radius: 1000
      }))

      setLayers(prev => [...prev, ...newLayers])
      setActivePanel("layers")
      
      if (newLayers[0]) setTimeout(() => fitToLayer(newLayers[0]), 100)
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

      const layerGroups = splitByGeometryType(data, sample.name)

      if (layerGroups.length === 0) throw new Error("No valid geometry found")

      const newLayers: Layer[] = layerGroups.map((group, i) => ({
        id: `${Date.now()}-${i}`,
        name: group.name,
        visible: true,
        color: LAYER_COLORS[(layers.length + i) % LAYER_COLORS.length],
        opacity: 0.8,
        data: group.data,
        type: group.type,
        vizType: group.type === "point" ? "point" : group.type === "line" ? "line" : "fill",
        height: 1000,
        radius: 1000
      }))

      setLayers(prev => [...prev, ...newLayers])
      setActivePanel("layers")
      if (newLayers[0]) setTimeout(() => fitToLayer(newLayers[0]), 100)
    } catch (err) {
      alert("Failed to load sample")
    } finally {
      setUploading(false)
    }
  }

  // Layer update functions
  const toggleLayer = (id: string) => setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l))
  const updateLayerColor = (id: string, color: number[]) => setLayers(prev => prev.map(l => l.id === id ? { ...l, color } : l))
  const updateLayerOpacity = (id: string, opacity: number) => setLayers(prev => prev.map(l => l.id === id ? { ...l, opacity } : l))
  const updateLayerVizType = (id: string, vizType: VizType) => setLayers(prev => prev.map(l => l.id === id ? { ...l, vizType } : l))
  const updateLayerRadius = (id: string, radius: number) => setLayers(prev => prev.map(l => l.id === id ? { ...l, radius } : l))
  const updateLayerHeight = (id: string, height: number) => setLayers(prev => prev.map(l => l.id === id ? { ...l, height } : l))
  const removeLayer = (id: string) => setLayers(prev => prev.filter(l => l.id !== id))

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const featureCounts = (layer: Layer) => {
    const features = layer.data?.features?.length || 0
    return features.toLocaleString()
  }

  return (
    <div className="h-screen w-screen flex bg-[#242730] overflow-hidden font-['Inter',system-ui,sans-serif]">
      {/* Sidebar */}
      <div className="w-[340px] bg-[#29323c] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-[#3a4552]">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#6b5ce7] to-[#8b7cf7] rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white text-lg">🗺️</span>
            </div>
            <div>
              <span className="font-semibold text-white text-lg tracking-tight">Spatix</span>
              <p className="text-[11px] text-[#6a7485] font-medium">Map Visualization Studio</p>
            </div>
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#3a4552]">
          <button
            onClick={() => setActivePanel("layers")}
            className={`flex-1 py-3.5 text-xs font-semibold uppercase tracking-wider transition-all ${
              activePanel === "layers" 
                ? "text-white bg-[#3a4552] border-b-2 border-[#6b5ce7]" 
                : "text-[#6a7485] hover:text-white hover:bg-[#3a4552]/50"
            }`}
          >
            Layers ({layers.length})
          </button>
          <button
            onClick={() => setActivePanel("add")}
            className={`flex-1 py-3.5 text-xs font-semibold uppercase tracking-wider transition-all ${
              activePanel === "add" 
                ? "text-white bg-[#3a4552] border-b-2 border-[#6b5ce7]" 
                : "text-[#6a7485] hover:text-white hover:bg-[#3a4552]/50"
            }`}
          >
            Add Data
          </button>
          <button
            onClick={() => setActivePanel("history")}
            className={`flex-1 py-3.5 text-xs font-semibold uppercase tracking-wider transition-all ${
              activePanel === "history" 
                ? "text-white bg-[#3a4552] border-b-2 border-[#6b5ce7]" 
                : "text-[#6a7485] hover:text-white hover:bg-[#3a4552]/50"
            }`}
          >
            My Maps
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activePanel === "layers" && (
            <div className="p-4 space-y-3">
              {layers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-[#3a4552] rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl opacity-50">📊</span>
                  </div>
                  <p className="text-[#6a7485] text-sm font-medium">No layers yet</p>
                  <button
                    onClick={() => setActivePanel("add")}
                    className="mt-4 text-[#6b5ce7] text-sm font-semibold hover:text-[#8b7cf7] transition-colors"
                  >
                    + Add your first layer
                  </button>
                </div>
              ) : (
                layers.map(layer => (
                  <div key={layer.id} className="bg-[#3a4552] rounded-xl overflow-hidden">
                    {/* Layer header */}
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={() => toggleLayer(layer.id)}
                          className={`w-5 h-5 rounded flex items-center justify-center transition-all flex-shrink-0 ${
                            layer.visible ? "bg-[#6b5ce7]" : "bg-[#242730] border border-[#6a7485]"
                          }`}
                        >
                          {layer.visible && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{layer.name}</p>
                          <p className="text-[#6a7485] text-xs">{featureCounts(layer)} features</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => fitToLayer(layer)} className="p-2 text-[#6a7485] hover:text-white hover:bg-[#242730] rounded-lg transition-all" title="Zoom to fit">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </button>
                        <button onClick={() => removeLayer(layer.id)} className="p-2 text-[#6a7485] hover:text-red-400 hover:bg-[#242730] rounded-lg transition-all" title="Remove">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Layer controls */}
                    <div className="px-4 pb-4 space-y-4">
                      {/* Viz Type */}
                      <div>
                        <label className="block text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Visualization</label>
                        <div className="grid grid-cols-3 gap-1">
                          {layer.type === "point" && (
                            <>
                              <button onClick={() => updateLayerVizType(layer.id, "point")} className={`py-2 text-xs font-medium rounded-lg transition-all ${layer.vizType === "point" ? "bg-[#6b5ce7] text-white" : "bg-[#242730] text-[#6a7485] hover:text-white"}`}>Point</button>
                              <button onClick={() => updateLayerVizType(layer.id, "heatmap")} className={`py-2 text-xs font-medium rounded-lg transition-all ${layer.vizType === "heatmap" ? "bg-[#6b5ce7] text-white" : "bg-[#242730] text-[#6a7485] hover:text-white"}`}>Heatmap</button>
                              <button onClick={() => updateLayerVizType(layer.id, "hexagon")} className={`py-2 text-xs font-medium rounded-lg transition-all ${layer.vizType === "hexagon" ? "bg-[#6b5ce7] text-white" : "bg-[#242730] text-[#6a7485] hover:text-white"}`}>Hexagon</button>
                            </>
                          )}
                          {layer.type === "polygon" && (
                            <>
                              <button onClick={() => updateLayerVizType(layer.id, "fill")} className={`py-2 text-xs font-medium rounded-lg transition-all ${layer.vizType === "fill" ? "bg-[#6b5ce7] text-white" : "bg-[#242730] text-[#6a7485] hover:text-white"}`}>Fill</button>
                              <button onClick={() => updateLayerVizType(layer.id, "3d")} className={`py-2 text-xs font-medium rounded-lg transition-all ${layer.vizType === "3d" ? "bg-[#6b5ce7] text-white" : "bg-[#242730] text-[#6a7485] hover:text-white"}`}>3D</button>
                            </>
                          )}
                          {layer.type === "line" && (
                            <button onClick={() => updateLayerVizType(layer.id, "line")} className="col-span-3 py-2 text-xs font-medium rounded-lg bg-[#6b5ce7] text-white">Line</button>
                          )}
                        </div>
                      </div>

                      {/* Color */}
                      <div>
                        <label className="block text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Color</label>
                        <div className="flex gap-1.5">
                          {LAYER_COLORS.map((color, i) => (
                            <button
                              key={i}
                              onClick={() => updateLayerColor(layer.id, color)}
                              className={`w-7 h-7 rounded-lg transition-all hover:scale-110 ${
                                layer.color.toString() === color.toString() ? "ring-2 ring-white ring-offset-2 ring-offset-[#3a4552]" : ""
                              }`}
                              style={{ backgroundColor: `rgb(${color.join(",")})` }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Radius (for heatmap/hexagon) */}
                      {(layer.vizType === "heatmap" || layer.vizType === "hexagon") && (
                        <div>
                          <label className="block text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider mb-2">
                            Radius: {layer.radius?.toLocaleString()}
                          </label>
                          <input type="range" min="10" max={layer.vizType === "hexagon" ? "50000" : "100"} value={layer.radius || 30} onChange={(e) => updateLayerRadius(layer.id, parseInt(e.target.value))} className="w-full h-1 bg-[#242730] rounded-lg appearance-none cursor-pointer accent-[#6b5ce7]" />
                        </div>
                      )}

                      {/* Height (for 3D) */}
                      {layer.vizType === "3d" && (
                        <div>
                          <label className="block text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Height: {layer.height?.toLocaleString()}m</label>
                          <input type="range" min="100" max="50000" step="100" value={layer.height || 1000} onChange={(e) => updateLayerHeight(layer.id, parseInt(e.target.value))} className="w-full h-1 bg-[#242730] rounded-lg appearance-none cursor-pointer accent-[#6b5ce7]" />
                        </div>
                      )}

                      {/* Opacity */}
                      <div>
                        <label className="block text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Opacity: {Math.round(layer.opacity * 100)}%</label>
                        <input type="range" min="0.1" max="1" step="0.05" value={layer.opacity} onChange={(e) => updateLayerOpacity(layer.id, parseFloat(e.target.value))} className="w-full h-1 bg-[#242730] rounded-lg appearance-none cursor-pointer accent-[#6b5ce7]" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activePanel === "add" && (
            <div className="p-4 space-y-6">
              {/* Upload */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver ? "border-[#6b5ce7] bg-[#6b5ce7]/10" : "border-[#3a4552] hover:border-[#6a7485]"
                }`}
              >
                <input ref={fileInputRef} type="file" className="hidden" accept=".geojson,.json,.csv,.kml,.gpx,.zip" onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full border-4 border-[#6b5ce7] border-t-transparent animate-spin" />
                    <p className="text-white text-sm font-medium">Processing...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 bg-[#3a4552] rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-7 h-7 text-[#6a7485]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-white text-sm font-semibold mb-1">Drop file to upload</p>
                    <p className="text-[#6a7485] text-xs">GeoJSON, Shapefile, KML, CSV, GPX</p>
                  </>
                )}
              </div>

              {/* Samples */}
              <div>
                <h3 className="text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider mb-3">Sample Datasets</h3>
                <div className="space-y-2">
                  {SAMPLE_DATASETS.map(sample => (
                    <button
                      key={sample.id}
                      onClick={() => loadSample(sample)}
                      disabled={uploading}
                      className="w-full flex items-center gap-4 p-4 bg-[#3a4552] rounded-xl hover:bg-[#424d5c] transition-all text-left disabled:opacity-50 group"
                    >
                      <div className="w-10 h-10 bg-[#242730] rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform">{sample.icon}</div>
                      <div>
                        <p className="text-white text-sm font-semibold">{sample.name}</p>
                        <p className="text-[#6a7485] text-xs">{sample.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* My Maps panel */}
          {activePanel === "history" && (
            <div className="p-4">
              {loadingMyMaps ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 rounded-full border-4 border-[#6b5ce7] border-t-transparent animate-spin" />
                </div>
              ) : myMapsError ? (
                <div className="text-center py-12">
                  <p className="text-red-400 text-sm mb-3">{myMapsError}</p>
                  <button onClick={fetchMyMaps} className="text-[#6b5ce7] text-sm font-semibold">Retry</button>
                </div>
              ) : myMaps.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-[#3a4552] rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl opacity-50">🗺️</span>
                  </div>
                  <p className="text-[#6a7485] text-sm font-medium">No saved maps yet</p>
                  <p className="text-[#6a7485] text-xs mt-2">Save a map to see it here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {myMaps.map(m => (
                    <a
                      key={m.id}
                      href={m.url}
                      className="block p-4 bg-[#3a4552] rounded-xl hover:bg-[#424d5c] transition-all"
                    >
                      <p className="text-white text-sm font-semibold truncate">{m.title}</p>
                      <p className="text-[#6a7485] text-xs mt-1">{m.views} views • {new Date(m.created_at).toLocaleDateString()}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Basemap */}
        <div className="p-4 border-t border-[#3a4552]">
          <label className="block text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Base Map</label>
          <div className="grid grid-cols-4 gap-1.5">
            {Object.entries(BASEMAPS).map(([key, { name }]) => (
              <button key={key} onClick={() => setBasemap(key)} className={`py-2 text-xs font-semibold rounded-lg transition-all ${basemap === key ? "bg-[#6b5ce7] text-white" : "bg-[#242730] text-[#6a7485] hover:text-white"}`}>{name}</button>
            ))}
          </div>
        </div>

        {/* Save & Share button */}
        {layers.length > 0 && (
          <div className="px-4 pb-4">
            <button
              onClick={() => setShowSaveModal(true)}
              className="w-full py-3 bg-[#6b5ce7] hover:bg-[#5a4bd6] text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#6b5ce7]/25"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Save & Share
            </button>
          </div>
        )}
      </div>

      {/* Map */}
      <div ref={mapContainer} className="flex-1" />

      {/* Error Toast */}
      {errorToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60]">
          <div className="bg-red-900/90 backdrop-blur-sm text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-md">
            <svg className="w-5 h-5 text-red-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm font-medium flex-1">{errorToast}</p>
            <button onClick={() => setErrorToast(null)} className="text-red-300 hover:text-white ml-2">✕</button>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#29323c] rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-1">Save & Share Your Map</h3>
              <p className="text-[#6a7485] text-sm mb-6">Enter your email to save and get a shareable link.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Map Title</label>
                  <input type="text" value={mapTitle} onChange={(e) => setMapTitle(e.target.value)} placeholder="My Map" className="w-full px-4 py-3 bg-[#242730] border border-[#3a4552] rounded-xl text-white placeholder-[#6a7485] text-sm focus:outline-none focus:border-[#6b5ce7]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 bg-[#242730] border border-[#3a4552] rounded-xl text-white placeholder-[#6a7485] text-sm focus:outline-none focus:border-[#6b5ce7]" onKeyDown={(e) => e.key === "Enter" && handleSaveMap()} />
                  <p className="text-[#6a7485] text-xs mt-2">We'll use this to let you find your maps later.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 py-3 border border-[#3a4552] text-[#6a7485] rounded-xl font-medium hover:bg-[#3a4552] hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSaveMap} disabled={saving || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)} className="flex-1 py-3 bg-[#6b5ce7] text-white rounded-xl font-semibold hover:bg-[#5a4bd6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {saving ? <><div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Saving...</> : "Save & Get Link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Success Modal */}
      {showShareModal && savedUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-1">Map saved!</h3>
                <p className="text-slate-500 text-sm">Your map is ready to share</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Share URL</label>
                <div className="flex gap-2">
                  <input type="text" value={savedUrl} readOnly className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-mono text-slate-700 truncate" />
                  <button onClick={copyShareLink} className={`px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${copiedLink ? "bg-green-100 text-green-700" : "bg-slate-900 text-white hover:bg-slate-800"}`}>
                    {copiedLink ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <a href={savedUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 text-center transition-colors">View Map</a>
                <button onClick={() => { setShowShareModal(false); setSavedUrl(null); setSavedMapId(null); }} className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors">Keep Editing</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
