"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import maplibregl from "maplibre-gl"
import { useAuth } from "@/contexts/AuthContext"
import { signInWithGoogle, signInWithGithub } from "@/lib/firebase"
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
  colorBy?: string | null
  colorDomain?: number[] | string[]
  colorType?: 'numeric' | 'categorical'
}

// Get color for a feature based on color-by attribute
function getFeatureColor(properties: Record<string, any>, layer: Layer): number[] {
  if (!layer.colorBy || !layer.colorDomain) return layer.color

  const value = properties[layer.colorBy]
  if (value == null) return [128, 128, 128]

  if (layer.colorType === 'numeric') {
    const domain = layer.colorDomain as number[]
    const [min, max] = [domain[0], domain[domain.length - 1]]
    const t = max > min ? Math.max(0, Math.min(1, (Number(value) - min) / (max - min))) : 0.5
    const palette = COLOR_PALETTES.uber
    const idx = Math.min(Math.floor(t * palette.length), palette.length - 1)
    const hex = palette[idx].replace('#', '')
    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)]
  }

  if (layer.colorType === 'categorical') {
    const idx = (layer.colorDomain as string[]).indexOf(String(value))
    if (idx === -1) return [128, 128, 128]
    return LAYER_COLORS[idx % LAYER_COLORS.length]
  }

  return layer.color
}

interface SavedMap {
  id: string
  title: string
  url: string
  created_at: string
  views: number
}

export default function MapsPage() {
  const { user: authUser, isLoggedIn, login: authLogin, logout: authLogout } = useAuth()
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

  // Auth prompt state
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [showNavMenu, setShowNavMenu] = useState(false)

  // Error toast state
  const [errorToast, setErrorToast] = useState<string | null>(null)

  // Tooltip state for hover
  const [tooltip, setTooltip] = useState<{x: number; y: number; properties: Record<string, any>; layerName: string} | null>(null)

  // Click-to-inspect state
  const [selectedFeature, setSelectedFeature] = useState<{properties: Record<string, any>; layerName: string; geometryType: string} | null>(null)

  // Cursor coordinate display
  const [cursorCoords, setCursorCoords] = useState<{lng: number; lat: number} | null>(null)

  // Data table state
  const [showDataTable, setShowDataTable] = useState(false)
  const [tableLayerId, setTableLayerId] = useState<string | null>(null)
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set())

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

  // Helper to get auth headers if user is logged in
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = localStorage.getItem("spatix_token")
    if (token) return { Authorization: `Bearer ${token}` }
    return {}
  }, [])

  // Fetch my maps when history tab is opened
  const fetchMyMaps = useCallback(async () => {
    const token = localStorage.getItem("spatix_token")
    const storedEmail = localStorage.getItem("spatix_save_email")
    if (!token && !storedEmail) {
      setMyMaps([])
      return
    }
    setLoadingMyMaps(true)
    setMyMapsError(null)
    try {
      // Prefer authenticated endpoint if token is available
      let res = token
        ? await fetch(`${API_URL}/api/maps/me`, { headers: { Authorization: `Bearer ${token}` } })
        : null
      // If authenticated request failed (expired token etc.), fall back to email lookup
      if (res && !res.ok && storedEmail) {
        res = await fetch(`${API_URL}/api/maps/by-email?email=${encodeURIComponent(storedEmail)}`)
      } else if (!res && storedEmail) {
        res = await fetch(`${API_URL}/api/maps/by-email?email=${encodeURIComponent(storedEmail)}`)
      }
      if (!res) {
        setMyMaps([])
      } else if (res.ok) {
        const data = await res.json()
        setMyMaps(data.maps || [])
      } else {
        const errData = await res.json().catch(() => null)
        const detail = errData?.detail
        const msg = typeof detail === "string" ? detail
          : Array.isArray(detail) ? detail[0]?.msg || "Server error"
          : detail?.message || detail?.error || "Could not load your maps"
        setMyMapsError(msg)
      }
    } catch (err) {
      setMyMapsError(err instanceof TypeError ? "Connection failed. Check your network." : "Could not load your maps")
    } finally {
      setLoadingMyMaps(false)
    }
  }, [])

  useEffect(() => {
    if (activePanel === "history") fetchMyMaps()
  }, [activePanel, fetchMyMaps])

  // Save map to backend (requires auth)
  const handleSaveMap = async () => {
    const saveEmail = authUser?.email || email
    if (!saveEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(saveEmail)) return
    if (layers.length === 0) return

    setSaving(true)
    try {
      // Merge all visible layer data into a single FeatureCollection
      const allFeatures = layers
        .filter(l => l.visible)
        .flatMap(l => l.data?.features || [])
      const mergedGeojson = { type: "FeatureCollection", features: allFeatures }

      // Derive style from the primary layer so the shared view preserves it
      const primaryLayer = layers.find(l => l.visible) || layers[0]
      const layerStyle = primaryLayer ? {
        fillColor: `rgb(${primaryLayer.color.join(",")})`,
        fillOpacity: primaryLayer.opacity * 0.6,
        strokeColor: `rgb(${primaryLayer.color.join(",")})`,
        strokeWidth: 2,
        strokeOpacity: Math.min(primaryLayer.opacity + 0.2, 1),
        pointRadius: 6,
      } : undefined

      // Capture current map view so the shared map restores exactly
      const currentCenter = map.current ? [map.current.getCenter().lng, map.current.getCenter().lat] : undefined
      const currentZoom = map.current ? Math.round(map.current.getZoom() * 10) / 10 : undefined

      const res = await fetch(`${API_URL}/api/map`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          data: mergedGeojson,
          title: mapTitle || "Untitled Map",
          style: basemap === "dark" ? "dark" : basemap === "satellite" ? "satellite" : "light",
          email: saveEmail.trim().toLowerCase(),
          layerStyle,
          center: currentCenter,
          zoom: currentZoom,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => null)
        const detail = errData?.detail
        const msg = typeof detail === "string" ? detail
          : Array.isArray(detail) ? detail[0]?.msg || "Validation error"
          : detail?.message || detail?.error || "Server error"
        throw new Error(msg)
      }
      const data = await res.json()

      // Store email for next time
      localStorage.setItem("spatix_save_email", saveEmail.trim().toLowerCase())

      setSavedUrl(data.url)
      setSavedMapId(data.id)
      setShowSaveModal(false)
      setShowShareModal(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setErrorToast(`Failed to save map: ${message}`)
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

  // Handle save/share button click - gate behind auth
  const handleSaveShareClick = () => {
    if (isLoggedIn) {
      setEmail(authUser?.email || "")
      setShowSaveModal(true)
    } else {
      setShowAuthPrompt(true)
    }
  }

  // OAuth sign-in handlers for the auth prompt modal
  const handleAuthGoogle = async () => {
    setAuthLoading(true)
    try {
      const result = await signInWithGoogle()
      const firebaseToken = await result.user.getIdToken()
      const res = await fetch(`${API_URL}/auth/firebase/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: firebaseToken }),
      })
      if (!res.ok) throw new Error("Auth failed")
      const data = await res.json()
      authLogin(data.user.email, data.token)
      setEmail(data.user.email)
      setShowAuthPrompt(false)
      setShowSaveModal(true)
    } catch (err) {
      setErrorToast("Sign in failed. Please try again.")
    } finally {
      setAuthLoading(false)
    }
  }

  const handleAuthGithub = async () => {
    setAuthLoading(true)
    try {
      const result = await signInWithGithub()
      const firebaseToken = await result.user.getIdToken()
      const res = await fetch(`${API_URL}/auth/firebase/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: firebaseToken }),
      })
      if (!res.ok) throw new Error("Auth failed")
      const data = await res.json()
      authLogin(data.user.email, data.token)
      setEmail(data.user.email)
      setShowAuthPrompt(false)
      setShowSaveModal(true)
    } catch (err) {
      setErrorToast("Sign in failed. Please try again.")
    } finally {
      setAuthLoading(false)
    }
  }

  const handleNavLogout = () => {
    authLogout()
    setShowNavMenu(false)
  }

  // Hover handler for deck.gl layers
  const onLayerHover = useCallback((info: any, layerName: string) => {
    if (info.object) {
      // For ScatterplotLayer, data items have {position, properties}
      // For GeoJsonLayer, data items are GeoJSON features with {properties}
      // For HexagonLayer, data items are aggregation bins with {points}
      const props = info.object.properties || {}
      setTooltip({ x: info.x, y: info.y, properties: props, layerName })
    } else {
      setTooltip(null)
    }
  }, [])

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
        // Find a numeric property to use as weight for better intensity variation
        const weightAttr = (() => {
          const candidateNames = ["mag", "magnitude", "value", "weight", "intensity", "count", "score", "rating", "depth", "size", "amount", "population", "density"]
          const sampleProps = points.slice(0, 20).map((d: any) => d.properties)
          for (const name of candidateNames) {
            const match = sampleProps.some((p: any) => typeof p[name] === "number" || (typeof p[name] === "string" && !isNaN(Number(p[name]))))
            if (match) return name
          }
          // Fall back to first numeric property
          for (const key of Object.keys(sampleProps[0] || {})) {
            if (sampleProps.filter((p: any) => typeof p[key] === "number").length > sampleProps.length * 0.5) return key
          }
          return null
        })()

        // Compute weight range for normalization
        let getWeight: any = 1
        if (weightAttr) {
          const numericVals = points.map((d: any) => Number(d.properties[weightAttr])).filter((n: number) => !isNaN(n) && isFinite(n))
          if (numericVals.length > 0) {
            const min = Math.min(...numericVals)
            const max = Math.max(...numericVals)
            const range = max - min || 1
            getWeight = (d: any) => {
              const v = Number(d.properties[weightAttr])
              return isNaN(v) ? 0.1 : 0.1 + 0.9 * ((v - min) / range)
            }
          }
        }

        // Vibrant heatmap gradient: deep purple -> magenta -> orange -> yellow -> white
        const HEATMAP_COLORS: [number, number, number][] = [
          [75, 0, 130],    // deep indigo
          [156, 39, 176],  // purple
          [233, 30, 99],   // pink
          [255, 87, 34],   // deep orange
          [255, 193, 7],   // amber
          [255, 255, 255], // white hot
        ]

        return new HeatmapLayer({
          id: `heatmap-${layer.id}`,
          data: points,
          getPosition: (d: any) => d.position,
          getWeight,
          radiusPixels: layer.radius || 40,
          intensity: 2.5,
          threshold: 0.05,
          opacity: layer.opacity,
          colorRange: HEATMAP_COLORS,
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
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 60],
          onHover: (info: any) => {
            if (info.object) {
              const count = info.object.points?.length || 0
              setTooltip({ x: info.x, y: info.y, properties: { "Points in bin": count }, layerName: layer.name })
            } else {
              setTooltip(null)
            }
          },
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
          getFillColor: layer.colorBy
            ? ((d: any) => getFeatureColor(d.properties, layer)) as any
            : layer.color,
          getRadius: 5,
          radiusScale: 1,
          radiusMinPixels: 3,
          radiusMaxPixels: 30,
          opacity: layer.opacity,
          stroked: true,
          lineWidthMinPixels: 1,
          getLineColor: [255, 255, 255],
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 80],
          onHover: (info: any) => onLayerHover(info, layer.name),
          onClick: (info: any) => {
            if (info.object) setSelectedFeature({ properties: info.object.properties || {}, layerName: layer.name, geometryType: 'Point' })
          },
          updateTriggers: { getFillColor: [layer.color, layer.colorBy, layer.colorDomain] },
        })
      }

      // GeoJSON layer for lines and polygons
      if (layer.type === "line" || layer.type === "polygon") {
        return new GeoJsonLayer({
          id: `geojson-${layer.id}`,
          data: layer.data,
          filled: layer.type === "polygon",
          stroked: true,
          getFillColor: layer.colorBy
            ? ((d: any) => [...getFeatureColor(d.properties, layer), Math.floor(layer.opacity * 128)]) as any
            : [...layer.color, Math.floor(layer.opacity * 128)],
          getLineColor: layer.colorBy
            ? ((d: any) => getFeatureColor(d.properties, layer)) as any
            : layer.color,
          getLineWidth: 2,
          lineWidthMinPixels: 1,
          extruded: layer.vizType === "3d",
          getElevation: layer.height || 100,
          opacity: layer.opacity,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 80],
          onHover: (info: any) => onLayerHover(info, layer.name),
          onClick: (info: any) => {
            if (info.object) setSelectedFeature({ properties: info.object.properties || {}, layerName: layer.name, geometryType: info.object.geometry?.type || layer.type })
          },
          updateTriggers: { getFillColor: [layer.color, layer.colorBy, layer.colorDomain, layer.opacity], getLineColor: [layer.color, layer.colorBy, layer.colorDomain] },
        })
      }

      return []
    })
  }, [layers, onLayerHover])

  // Update deck overlay
  useEffect(() => {
    if (deckOverlay.current) {
      console.log('[Deck] Updating layers:', deckLayers.length, 'layers')
      try {
        deckOverlay.current.setProps({ layers: deckLayers })
      } catch (e) {
        console.error('[Deck] Error updating layers:', e)
      }
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

    m.on('mousemove', (e) => {
      setCursorCoords({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    })
    m.on('mouseout', () => setCursorCoords(null))

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

  // Detect a categorical column suitable for splitting into layers.
  // Only matches columns with explicitly category-like names to avoid
  // false positives on generic string columns (name, city, address, etc.).
  const detectCategoryColumn = (features: any[]): string | null => {
    if (features.length < 4) return null
    const candidateNames = ["category", "group", "layer", "class", "kind", "classification"]
    const allKeys = new Set<string>()
    features.slice(0, 50).forEach((f: any) => {
      Object.keys(f.properties || {}).forEach(k => allKeys.add(k))
    })

    for (const name of candidateNames) {
      const match = Array.from(allKeys).find(k =>
        k.toLowerCase() === name ||
        k.toLowerCase() === `${name}_name` ||
        k.toLowerCase() === `poi_${name}`
      )
      if (match) {
        const values = features.map((f: any) => f.properties?.[match]).filter((v: any) => v != null && v !== "")
        const unique = new Set(values.map(String))
        // Need at least 2 categories, at most 10, and categories should repeat (not all unique)
        if (unique.size >= 2 && unique.size <= 10 && unique.size < features.length * 0.4) {
          return match
        }
      }
    }

    return null
  }

  // Split GeoJSON by geometry type, then by category if single geometry type
  const splitByGeometryType = (geojson: any, baseName: string) => {
    const features = geojson.features || [geojson]
    const points: any[] = []
    const lines: any[] = []
    const polygons: any[] = []

    const classify = (f: any, geom: any) => {
      const type = geom?.type
      if (type === "Point" || type === "MultiPoint") points.push({ ...f, geometry: geom })
      else if (type === "LineString" || type === "MultiLineString") lines.push({ ...f, geometry: geom })
      else if (type === "Polygon" || type === "MultiPolygon") polygons.push({ ...f, geometry: geom })
      else if (type === "GeometryCollection") {
        geom.geometries?.forEach((g: any) => classify(f, g))
      }
    }

    features.forEach((f: any) => classify(f, f.geometry))

    const result: { name: string; type: "point" | "line" | "polygon"; data: any }[] = []
    const hasMultipleGeomTypes = [points, lines, polygons].filter(a => a.length > 0).length > 1

    // Helper to split a group of features by category column
    const splitByCategory = (feats: any[], geomType: "point" | "line" | "polygon", suffix: string) => {
      const categoryCol = detectCategoryColumn(feats)
      if (categoryCol) {
        const groups = new Map<string, any[]>()
        feats.forEach(f => {
          const val = String(f.properties?.[categoryCol] ?? "Other")
          if (!groups.has(val)) groups.set(val, [])
          groups.get(val)!.push(f)
        })
        for (const [val, groupFeats] of Array.from(groups.entries())) {
          result.push({
            name: `${baseName} · ${val}`,
            type: geomType,
            data: { type: "FeatureCollection", features: groupFeats }
          })
        }
      } else {
        result.push({
          name: hasMultipleGeomTypes ? `${baseName} · ${suffix}` : baseName,
          type: geomType,
          data: { type: "FeatureCollection", features: feats }
        })
      }
    }

    if (points.length > 0) splitByCategory(points, "point", "Points")
    if (lines.length > 0) splitByCategory(lines, "line", "Lines")
    if (polygons.length > 0) splitByCategory(polygons, "polygon", "Polygons")

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

      // Warn if data was truncated to preview limit
      if (data.feature_count && data.feature_count > 1000) {
        setErrorToast(`Showing 1,000 of ${data.feature_count.toLocaleString()} features (preview limit)`)
      }

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
      
      // Trigger map resize in case layout changed
      if (map.current) map.current.resize()
      if (newLayers[0]) setTimeout(() => fitToLayer(newLayers[0]), 100)
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : "Upload failed")
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
      if (map.current) map.current.resize()
      if (newLayers[0]) setTimeout(() => fitToLayer(newLayers[0]), 100)
    } catch (err) {
      setErrorToast("Failed to load sample dataset")
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
  const toggleExpand = (id: string) => setExpandedLayers(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const updateLayerColorBy = (id: string, attribute: string | null) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l
      if (!attribute) return { ...l, colorBy: null, colorDomain: undefined, colorType: undefined }

      const features = l.data?.features || []
      const values = features.map((f: any) => f.properties?.[attribute]).filter((v: any) => v != null)
      const numericValues = values.filter((v: any) => typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)) && v.trim() !== ''))
      const isNumeric = numericValues.length / Math.max(values.length, 1) > 0.8

      if (isNumeric) {
        const nums = numericValues.map(Number)
        return { ...l, colorBy: attribute, colorDomain: [Math.min(...nums), Math.max(...nums)], colorType: 'numeric' as const }
      } else {
        const unique = Array.from(new Set<string>(values.map(String))).slice(0, 8)
        return { ...l, colorBy: attribute, colorDomain: unique, colorType: 'categorical' as const }
      }
    }))
  }

  const handleExport = () => {
    const allFeatures = layers
      .filter(l => l.visible)
      .flatMap(l => l.data?.features || [])
    const geojson = { type: "FeatureCollection", features: allFeatures }
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spatix-export.geojson`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Data table: auto-select first layer when opened
  const tableLayer = layers.find(l => l.id === tableLayerId) || layers[0] || null
  const tableColumns = useMemo(() => {
    if (!tableLayer?.data?.features?.length) return []
    const colSet = new Set<string>()
    tableLayer.data.features.forEach((f: any) => {
      Object.keys(f.properties || {}).forEach((k: string) => colSet.add(k))
    })
    return Array.from(colSet)
  }, [tableLayer])

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
    <div className="h-screen w-screen flex flex-col bg-[#242730] overflow-hidden font-['Inter',system-ui,sans-serif]">
      {/* Compact Navigation Header */}
      <div className="h-11 bg-[#1e2128] border-b border-[#3a4552] flex items-center justify-between px-4 shrink-0 z-30">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 bg-gradient-to-br from-[#6b5ce7] to-[#8b7cf7] rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">🗺️</span>
            </div>
            <span className="font-semibold text-white text-sm tracking-tight group-hover:text-[#8b7cf7] transition-colors">Spatix</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/" className="px-2.5 py-1 text-xs font-medium text-[#6a7485] hover:text-white hover:bg-[#3a4552] rounded-md transition-all">
              Home
            </Link>
            <Link href="/dashboard" className="px-2.5 py-1 text-xs font-medium text-[#6a7485] hover:text-white hover:bg-[#3a4552] rounded-md transition-all">
              Dashboard
            </Link>
            <Link href="/developers" className="px-2.5 py-1 text-xs font-medium text-[#6a7485] hover:text-white hover:bg-[#3a4552] rounded-md transition-all">
              Developers
            </Link>
          </div>
        </div>
        <div className="flex items-center">
          {isLoggedIn && authUser ? (
            <div className="relative">
              <button
                onClick={() => setShowNavMenu(!showNavMenu)}
                className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[#3a4552] transition-colors"
              >
                <div className="w-6 h-6 bg-[#6b5ce7] rounded-full flex items-center justify-center text-white text-[11px] font-medium">
                  {authUser.email[0].toUpperCase()}
                </div>
                <span className="text-xs text-[#8b9ab0] max-w-[140px] truncate hidden sm:block">{authUser.email}</span>
                <svg className="w-3 h-3 text-[#6a7485]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showNavMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNavMenu(false)} />
                  <div className="absolute right-0 mt-1.5 w-52 bg-[#29323c] rounded-xl shadow-xl border border-[#3a4552] py-1.5 z-50">
                    <div className="px-3 py-2 border-b border-[#3a4552]">
                      <p className="text-xs font-medium text-white truncate">{authUser.email}</p>
                    </div>
                    <Link href="/dashboard" onClick={() => setShowNavMenu(false)} className="block px-3 py-2 text-xs text-[#8b9ab0] hover:text-white hover:bg-[#3a4552]">
                      Dashboard
                    </Link>
                    <Link href="/dashboard?tab=maps" onClick={() => setShowNavMenu(false)} className="block px-3 py-2 text-xs text-[#8b9ab0] hover:text-white hover:bg-[#3a4552]">
                      My Maps
                    </Link>
                    <hr className="my-1.5 border-[#3a4552]" />
                    <button onClick={handleNavLogout} className="block w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-900/20">
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="px-2.5 py-1 text-xs font-medium text-[#6a7485] hover:text-white transition-colors">
                Log in
              </Link>
              <Link href="/signup" className="px-3 py-1 text-xs font-medium bg-[#6b5ce7] text-white rounded-md hover:bg-[#5a4bd6] transition-colors">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* Sidebar */}
      <div className="w-[340px] bg-[#29323c] flex flex-col shadow-2xl">
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
                    {/* Layer header - clickable to expand */}
                    <div 
                      className="p-3 flex items-center justify-between cursor-pointer hover:bg-[#444c5a] transition-colors"
                      onClick={() => toggleExpand(layer.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id) }}
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
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium truncate">{layer.name}</p>
                          {!expandedLayers.has(layer.id) && (
                            <p className="text-[#6a7485] text-xs">{featureCounts(layer)} features · {layer.vizType}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); fitToLayer(layer) }} className="p-1.5 text-[#6a7485] hover:text-white hover:bg-[#242730] rounded-lg transition-all" title="Zoom to fit">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeLayer(layer.id) }} className="p-1.5 text-[#6a7485] hover:text-red-400 hover:bg-[#242730] rounded-lg transition-all" title="Remove">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                        <svg className={`w-4 h-4 text-[#6a7485] transition-transform ${expandedLayers.has(layer.id) ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                    
                    {/* Layer controls - collapsible */}
                    {expandedLayers.has(layer.id) && (
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

                      {/* Color By Attribute */}
                      {layer.data?.features?.[0]?.properties && Object.keys(layer.data.features[0].properties).length > 0 && (
                        <div>
                          <label className="block text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Color By</label>
                          <select
                            value={layer.colorBy || ""}
                            onChange={(e) => updateLayerColorBy(layer.id, e.target.value || null)}
                            className="w-full px-3 py-2 bg-[#242730] border border-[#3a4552] rounded-lg text-white text-xs focus:outline-none focus:border-[#6b5ce7] appearance-none cursor-pointer"
                          >
                            <option value="">Uniform color</option>
                            {Array.from(new Set<string>(
                              (layer.data.features || []).flatMap((f: any) => Object.keys(f.properties || {}))
                            )).map((attr) => (
                              <option key={attr} value={attr}>{attr}</option>
                            ))}
                          </select>
                        </div>
                      )}

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
                    )}
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

          {/* My Maps Panel */}
          {activePanel === "history" && (
            <div className="p-4 space-y-3">
              {loadingMyMaps ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-10 h-10 rounded-full border-4 border-[#6b5ce7] border-t-transparent animate-spin mb-3" />
                  <p className="text-[#6a7485] text-sm">Loading your maps...</p>
                </div>
              ) : myMapsError ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-red-400 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-red-400 text-sm font-medium mb-1">{myMapsError}</p>
                  <button onClick={fetchMyMaps} className="text-[#6b5ce7] text-sm font-semibold hover:text-[#8b7cf7] mt-2">
                    Try again
                  </button>
                </div>
              ) : myMaps.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-[#3a4552] rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-[#6a7485] opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                  <p className="text-[#6a7485] text-sm font-medium mb-1">No saved maps yet</p>
                  <p className="text-[#6a7485] text-xs">Save a map to see it here</p>
                </div>
              ) : (
                myMaps.map(m => (
                  <a
                    key={m.id}
                    href={`/m/${m.id}`}
                    className="block bg-[#3a4552] rounded-xl p-4 hover:bg-[#424d5c] transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium truncate group-hover:text-[#8b7cf7] transition-colors">
                          {m.title || "Untitled Map"}
                        </p>
                        <p className="text-[#6a7485] text-xs mt-1">
                          {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {m.views > 0 && <span className="ml-2">{m.views} views</span>}
                        </p>
                      </div>
                      <svg className="w-4 h-4 text-[#6a7485] group-hover:text-white flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                  </a>
                ))
              )}
            </div>
          )}
        </div>

        {/* Basemap & Save */}
        <div className="border-t border-[#3a4552]">
          <div className="p-4">
            <label className="block text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Base Map</label>
            <div className="grid grid-cols-4 gap-1.5">
              {Object.entries(BASEMAPS).map(([key, { name }]) => (
                <button key={key} onClick={() => setBasemap(key)} className={`py-2 text-xs font-semibold rounded-lg transition-all ${basemap === key ? "bg-[#6b5ce7] text-white" : "bg-[#242730] text-[#6a7485] hover:text-white"}`}>{name}</button>
              ))}
            </div>
          </div>

          {/* Save & Share + Export buttons */}
          {layers.length > 0 && (
            <div className="px-4 pb-4 space-y-2">
              <button
                onClick={handleSaveShareClick}
                className="w-full py-3 bg-[#6b5ce7] hover:bg-[#5a4bd6] text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#6b5ce7]/25"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Save & Share
              </button>
              <button
                onClick={handleExport}
                className="w-full py-2.5 border border-[#3a4552] text-[#6a7485] hover:text-white hover:bg-[#3a4552] font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download GeoJSON
              </button>
              <button
                onClick={() => { setShowDataTable(!showDataTable); if (!tableLayerId && layers[0]) setTableLayerId(layers[0].id) }}
                className={`w-full py-2.5 border font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm ${
                  showDataTable
                    ? "border-[#6b5ce7] text-[#8b7cf7] bg-[#6b5ce7]/10"
                    : "border-[#3a4552] text-[#6a7485] hover:text-white hover:bg-[#3a4552]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Data Table
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Map + Data Table
          ⚠️  CRITICAL: h-full + overflow-hidden are REQUIRED here!
          Without them, the map canvas renders at wrong height (300px bug).
          flex-1 alone doesn't work - explicit height must chain from parent.
      */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <div className={`relative h-full ${showDataTable ? 'flex-1 min-h-0' : 'flex-1'}`}>
        <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
        {/* First-visit onboarding hint */}
        {layers.length === 0 && mapReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="bg-[#29323c]/90 backdrop-blur-sm rounded-2xl px-8 py-6 text-center max-w-sm pointer-events-auto">
              <div className="w-14 h-14 bg-[#6b5ce7]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-[#8b7cf7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-white font-semibold mb-1">Upload data to get started</p>
              <p className="text-[#6a7485] text-sm">Drop a file on the left panel, or try a sample dataset</p>
            </div>
          </div>
        )}
        {/* Hover Tooltip */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{ left: Math.min(tooltip.x + 12, (typeof window !== 'undefined' ? window.innerWidth - 340 - 280 : 400)), top: tooltip.y - 12 }}
          >
            <div className="bg-[#1a1e25]/95 backdrop-blur-sm rounded-lg shadow-xl border border-[#3a4552] px-3 py-2.5 max-w-[260px]">
              <p className="text-[#8b7cf7] text-[10px] font-semibold uppercase tracking-wider mb-1.5">{tooltip.layerName}</p>
              <div className="space-y-1">
                {Object.entries(tooltip.properties)
                  .filter(([, v]) => v != null && v !== '' && v !== undefined)
                  .slice(0, 12)
                  .map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-xs leading-tight">
                      <span className="text-[#6a7485] shrink-0 truncate max-w-[90px]">{key}</span>
                      <span className="text-white truncate">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                    </div>
                  ))
                }
                {Object.keys(tooltip.properties).filter(k => tooltip.properties[k] != null && tooltip.properties[k] !== '').length > 12 && (
                  <p className="text-[#6a7485] text-[10px] mt-1">+ {Object.keys(tooltip.properties).length - 12} more fields</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Click-to-Inspect Panel */}
        {selectedFeature && (
          <div className="absolute top-4 right-4 z-20 w-80 max-h-[70vh] bg-[#1a1e25]/95 backdrop-blur-sm rounded-xl shadow-2xl border border-[#3a4552] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#3a4552]">
              <div>
                <p className="text-[#8b7cf7] text-[10px] font-semibold uppercase tracking-wider">{selectedFeature.layerName}</p>
                <p className="text-[#6a7485] text-[10px]">{selectedFeature.geometryType}</p>
              </div>
              <button onClick={() => setSelectedFeature(null)} className="text-[#6a7485] hover:text-white p-1 rounded-lg hover:bg-[#3a4552] transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-48px)] p-4 space-y-0">
              {Object.entries(selectedFeature.properties)
                .filter(([, v]) => v != null && v !== '')
                .map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3 text-xs py-2 border-b border-[#3a4552]/50 last:border-0">
                    <span className="text-[#6a7485] font-medium shrink-0">{key}</span>
                    <span className="text-white text-right break-all">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                  </div>
                ))
              }
              {Object.keys(selectedFeature.properties).filter(k => selectedFeature.properties[k] != null && selectedFeature.properties[k] !== '').length === 0 && (
                <p className="text-[#6a7485] text-xs text-center py-4">No attributes</p>
              )}
            </div>
          </div>
        )}

        {/* Legend for Color-By Layers */}
        {layers.some(l => l.visible && l.colorBy) && (
          <div className="absolute bottom-10 left-2 z-10 bg-[#1a1e25]/90 backdrop-blur-sm rounded-xl px-4 py-3 border border-[#3a4552] max-w-[220px]">
            {layers.filter(l => l.visible && l.colorBy).map(layer => (
              <div key={layer.id} className="mb-3 last:mb-0">
                <p className="text-[10px] font-semibold text-[#8b7cf7] uppercase tracking-wider mb-2">{layer.colorBy}</p>
                {layer.colorType === 'numeric' ? (
                  <div>
                    <div className="h-2.5 rounded-full" style={{ background: `linear-gradient(to right, ${COLOR_PALETTES.uber.join(', ')})` }} />
                    <div className="flex justify-between text-[10px] text-[#6a7485] mt-1">
                      <span>{(layer.colorDomain as number[])?.[0]?.toLocaleString()}</span>
                      <span>{(layer.colorDomain as number[])?.[1]?.toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {(layer.colorDomain as string[])?.map((val, i) => (
                      <div key={val} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: `rgb(${LAYER_COLORS[i % LAYER_COLORS.length].join(',')})` }} />
                        <span className="text-[10px] text-[#6a7485] truncate">{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Coordinate Display */}
        {cursorCoords && (
          <div className="absolute bottom-2 left-2 z-10 bg-[#1a1e25]/80 backdrop-blur-sm rounded-lg px-3 py-1.5 text-[11px] font-mono text-[#6a7485]">
            {cursorCoords.lat.toFixed(6)}, {cursorCoords.lng.toFixed(6)}
          </div>
        )}
        </div>

        {/* Data Table Panel */}
        {showDataTable && layers.length > 0 && (
          <div className="h-[280px] bg-[#1a1e25] border-t border-[#3a4552] flex flex-col shrink-0">
            {/* Table header with layer tabs */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#3a4552] shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto min-w-0">
                {layers.map(layer => (
                  <button
                    key={layer.id}
                    onClick={() => setTableLayerId(layer.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                      (tableLayerId === layer.id || (!tableLayerId && layer.id === layers[0]?.id))
                        ? "bg-[#6b5ce7] text-white"
                        : "text-[#6a7485] hover:text-white hover:bg-[#3a4552]"
                    }`}
                  >
                    {layer.name}
                    <span className="ml-1.5 opacity-60">({(layer.data?.features?.length || 0).toLocaleString()})</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowDataTable(false)}
                className="text-[#6a7485] hover:text-white p-1.5 rounded-lg hover:bg-[#3a4552] transition-colors ml-2 shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Table content */}
            {tableLayer && tableColumns.length > 0 ? (
              <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#242730]">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider border-b border-[#3a4552] whitespace-nowrap">#</th>
                      {tableColumns.map(col => (
                        <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold text-[#6a7485] uppercase tracking-wider border-b border-[#3a4552] whitespace-nowrap">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(tableLayer.data?.features || []).slice(0, 500).map((feature: any, idx: number) => (
                      <tr
                        key={idx}
                        onClick={() => {
                          const props = feature.properties || {}
                          setSelectedFeature({ properties: props, layerName: tableLayer.name, geometryType: feature.geometry?.type || tableLayer.type })
                        }}
                        className="hover:bg-[#6b5ce7]/10 cursor-pointer border-b border-[#3a4552]/30"
                      >
                        <td className="px-3 py-1.5 text-[#6a7485] tabular-nums">{idx + 1}</td>
                        {tableColumns.map(col => (
                          <td key={col} className="px-3 py-1.5 text-white max-w-[200px] truncate" title={feature.properties?.[col] != null ? String(feature.properties[col]) : ''}>
                            {feature.properties?.[col] != null ? (typeof feature.properties[col] === 'object' ? JSON.stringify(feature.properties[col]) : String(feature.properties[col])) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {(tableLayer.data?.features?.length || 0) > 500 && (
                      <tr>
                        <td colSpan={tableColumns.length + 1} className="px-3 py-2 text-center text-[#6a7485] text-xs">
                          Showing 500 of {tableLayer.data.features.length.toLocaleString()} rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[#6a7485] text-sm">No attribute data available</p>
              </div>
            )}
          </div>
        )}
      </div>
      </div>{/* end main content area */}

      {/* Save Modal (authenticated users only) */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#29323c] rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-1">Save & Share Your Map</h3>
              <p className="text-[#6a7485] text-sm mb-6">
                Saving as <span className="text-white font-medium">{authUser?.email}</span>
              </p>

              <div>
                <label className="block text-xs font-semibold text-[#6a7485] uppercase tracking-wider mb-2">Map Title</label>
                <input
                  type="text"
                  value={mapTitle}
                  onChange={(e) => setMapTitle(e.target.value)}
                  placeholder="My Map"
                  className="w-full px-4 py-3 bg-[#242730] border border-[#3a4552] rounded-xl text-white placeholder-[#6a7485] text-sm focus:outline-none focus:border-[#6b5ce7] transition-colors"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveMap()}
                />
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 py-3 border border-[#3a4552] text-[#6a7485] rounded-xl font-medium hover:bg-[#3a4552] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMap}
                disabled={saving}
                className="flex-1 py-3 bg-[#6b5ce7] text-white rounded-xl font-semibold hover:bg-[#5a4bd6] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save & Get Link"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auth Prompt Modal (for unauthenticated users trying to save) */}
      {showAuthPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#29323c] rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-[#6b5ce7]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-[#8b7cf7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-1">Sign in to save & share</h3>
                <p className="text-[#6a7485] text-sm">Create a free account to save your map and get a shareable link.</p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleAuthGoogle}
                  disabled={authLoading}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>
                <button
                  onClick={handleAuthGithub}
                  disabled={authLoading}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-gray-900 rounded-xl font-medium text-white hover:bg-gray-800 transition-all disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  Continue with GitHub
                </button>
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#3a4552]"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-[#29323c] text-[#6a7485]">or</span>
                </div>
              </div>

              <Link
                href="/login?redirect=/maps"
                className="block text-center text-[#8b7cf7] text-sm font-medium hover:text-[#a594ff] transition-colors"
              >
                Sign in with email
              </Link>
            </div>

            <div className="p-6 pt-0">
              <button
                onClick={() => setShowAuthPrompt(false)}
                className="w-full py-3 border border-[#3a4552] text-[#6a7485] rounded-xl font-medium hover:bg-[#3a4552] hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {errorToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] animate-[slideDown_0.3s_ease-out]">
          <div className="bg-red-900/90 backdrop-blur-sm text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-md">
            <svg className="w-5 h-5 text-red-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm font-medium flex-1">{errorToast}</p>
            <button onClick={() => setErrorToast(null)} className="text-red-300 hover:text-white ml-2 flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
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
                  <input
                    type="text"
                    value={savedUrl}
                    readOnly
                    className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-mono text-slate-700 truncate"
                  />
                  <button
                    onClick={copyShareLink}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                      copiedLink ? "bg-green-100 text-green-700" : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    {copiedLink ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mb-6">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Embed Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={`<iframe src="${savedUrl}?embed=1" width="600" height="400" frameborder="0"></iframe>`}
                    readOnly
                    className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-500 truncate"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`<iframe src="${savedUrl}?embed=1" width="600" height="400" frameborder="0"></iframe>`)
                    }}
                    className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium whitespace-nowrap hover:bg-slate-200 transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <a
                  href={savedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 text-center transition-colors"
                >
                  View Map
                </a>
                <button
                  onClick={() => {
                    setShowShareModal(false)
                    setSavedUrl(null)
                    setSavedMapId(null)
                  }}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 transition-colors"
                >
                  Keep Editing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
