"use client"

import { useRef, useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

const BASEMAPS: Record<string, string | object> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
  streets: "https://tiles.openfreemap.org/styles/bright",
  satellite: {
    version: 8,
    sources: { satellite: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256 } },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }],
  },
}

/**
 * Embeddable map preview page.
 *
 * Usage:
 *   <iframe src="https://spatix.io/embed/preview?geojson=URL&style=dark&color=%236366f1" width="600" height="400" />
 *
 * Query params:
 *   geojson  - URL to a GeoJSON file (required, or use inline `data`)
 *   data     - Inline GeoJSON string (URL-encoded)
 *   style    - Basemap: light, dark, streets, satellite (default: streets)
 *   color    - Point/fill color as hex (default: #6366f1)
 *   title    - Optional label shown bottom-left
 *   zoom     - Initial zoom level
 *   lat, lng - Initial center
 */
function EmbedPreviewContent() {
  const searchParams = useSearchParams()
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const geojsonUrl = searchParams.get("geojson")
  const inlineData = searchParams.get("data")
  const style = searchParams.get("style") || "streets"
  const color = searchParams.get("color") || "#6366f1"
  const title = searchParams.get("title")
  const zoom = searchParams.get("zoom")
  const lat = searchParams.get("lat")
  const lng = searchParams.get("lng")

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const basemapStyle = BASEMAPS[style] || BASEMAPS.streets
    const center: [number, number] = lng && lat ? [parseFloat(lng), parseFloat(lat)] : [0, 20]

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: basemapStyle as any,
      center,
      zoom: zoom ? parseInt(zoom) : 2,
      attributionControl: false,
    })

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")

    m.on("load", async () => {
      map.current = m

      try {
        let geojson: any = null

        if (inlineData) {
          geojson = JSON.parse(inlineData)
        } else if (geojsonUrl) {
          const res = await fetch(geojsonUrl)
          if (!res.ok) throw new Error("Failed to fetch GeoJSON")
          geojson = await res.json()
        }

        if (!geojson) {
          setLoaded(true)
          return
        }

        // Normalize to FeatureCollection
        if (geojson.type === "Feature") {
          geojson = { type: "FeatureCollection", features: [geojson] }
        } else if (geojson.type !== "FeatureCollection") {
          geojson = { type: "FeatureCollection", features: [{ type: "Feature", geometry: geojson, properties: {} }] }
        }

        m.addSource("preview-data", { type: "geojson", data: geojson })

        // Detect geometry types
        const types = new Set(geojson.features.map((f: any) => f.geometry?.type))
        const hasPoints = types.has("Point") || types.has("MultiPoint")
        const hasLines = types.has("LineString") || types.has("MultiLineString")
        const hasPolygons = types.has("Polygon") || types.has("MultiPolygon")

        if (hasPolygons) {
          m.addLayer({
            id: "preview-fill",
            type: "fill",
            source: "preview-data",
            filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
            paint: { "fill-color": color, "fill-opacity": 0.3 },
          })
          m.addLayer({
            id: "preview-fill-outline",
            type: "line",
            source: "preview-data",
            filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
            paint: { "line-color": color, "line-width": 2 },
          })
        }

        if (hasLines) {
          m.addLayer({
            id: "preview-line",
            type: "line",
            source: "preview-data",
            filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"]],
            paint: { "line-color": color, "line-width": 3 },
          })
        }

        if (hasPoints) {
          m.addLayer({
            id: "preview-points",
            type: "circle",
            source: "preview-data",
            filter: ["any", ["==", ["geometry-type"], "Point"], ["==", ["geometry-type"], "MultiPoint"]],
            paint: {
              "circle-radius": 8,
              "circle-color": color,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          })
        }

        // Fit to data bounds if no explicit center
        if (!lat && !lng) {
          const bounds = new maplibregl.LngLatBounds()
          const addCoords = (coords: any) => {
            if (typeof coords[0] === "number") bounds.extend(coords as [number, number])
            else coords.forEach(addCoords)
          }
          geojson.features.forEach((f: any) => {
            if (f.geometry?.coordinates) addCoords(f.geometry.coordinates)
          })
          if (!bounds.isEmpty()) {
            m.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 })
          }
        }

        setLoaded(true)
      } catch (err: any) {
        setError(err.message || "Failed to load data")
        setLoaded(true)
      }
    })

    return () => {
      m.remove()
      map.current = null
    }
  }, [geojsonUrl, inlineData, style, color, zoom, lat, lng])

  return (
    <div className="w-screen h-screen relative bg-slate-100">
      <div ref={mapContainer} className="absolute inset-0" />

      {title && loaded && (
        <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-lg px-3 py-1.5 shadow-lg z-10 text-xs">
          <span className="font-semibold text-slate-800">{title}</span>
        </div>
      )}

      {/* Spatix attribution */}
      <div className="absolute top-2 right-2 z-10">
        <a
          href="https://spatix.io"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/90 backdrop-blur px-2 py-1 rounded text-[10px] text-slate-500 hover:text-slate-800 transition-colors"
        >
          Spatix
        </a>
      </div>

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-20">
          <div className="bg-white rounded-xl shadow-lg p-6 text-center max-w-sm mx-4">
            <p className="text-red-600 font-medium text-sm">{error}</p>
            <p className="text-slate-500 text-xs mt-2">Check the GeoJSON URL or data parameter</p>
          </div>
        </div>
      )}

      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-100">
      <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
    </div>
  )
}

export default function EmbedPreviewPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <EmbedPreviewContent />
    </Suspense>
  )
}
