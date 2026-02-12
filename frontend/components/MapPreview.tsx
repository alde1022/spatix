"use client"

import { useRef, useEffect, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

interface MapPreviewProps {
  geojson?: any
  center?: [number, number]
  zoom?: number
  interactive?: boolean
  className?: string
  style?: "light" | "dark" | "streets"
  color?: string
  animate?: boolean
}

const STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
  streets: "https://tiles.openfreemap.org/styles/bright",
}

// Sample SF data for demo
const DEMO_GEOJSON = {
  type: "FeatureCollection",
  features: [
    // Coffee shops as points
    { type: "Feature", properties: { name: "Blue Bottle", type: "cafe" }, geometry: { type: "Point", coordinates: [-122.4086, 37.7823] }},
    { type: "Feature", properties: { name: "Sightglass", type: "cafe" }, geometry: { type: "Point", coordinates: [-122.4105, 37.7715] }},
    { type: "Feature", properties: { name: "Ritual", type: "cafe" }, geometry: { type: "Point", coordinates: [-122.4215, 37.7565] }},
    { type: "Feature", properties: { name: "Philz", type: "cafe" }, geometry: { type: "Point", coordinates: [-122.4335, 37.7642] }},
    { type: "Feature", properties: { name: "Four Barrel", type: "cafe" }, geometry: { type: "Point", coordinates: [-122.4223, 37.7672] }},
    { type: "Feature", properties: { name: "Verve", type: "cafe" }, geometry: { type: "Point", coordinates: [-122.4052, 37.7821] }},
    // A walking route as line
    { type: "Feature", properties: { name: "Embarcadero Walk" }, geometry: { type: "LineString", coordinates: [[-122.3932, 37.7956], [-122.3889, 37.7897], [-122.3878, 37.7834], [-122.3901, 37.7765]] }},
    // Golden Gate Park as polygon
    { type: "Feature", properties: { name: "Golden Gate Park" }, geometry: { type: "Polygon", coordinates: [[[-122.5108, 37.7712], [-122.4534, 37.7712], [-122.4534, 37.7654], [-122.5108, 37.7654], [-122.5108, 37.7712]]] }},
  ]
}

export default function MapPreview({ 
  geojson = DEMO_GEOJSON,
  center,
  zoom,
  interactive = true,
  className = "",
  style = "light",
  color = "#6366f1",
  animate = true
}: MapPreviewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Calculate center/zoom from data if not provided
  const getInitialView = () => {
    if (center && zoom) return { center, zoom }
    
    const coords: [number, number][] = []
    const addCoords = (c: any) => {
      if (Array.isArray(c) && typeof c[0] === "number") coords.push([c[0], c[1]])
      else if (Array.isArray(c)) c.forEach(addCoords)
    }
    const features = geojson?.features || [geojson]
    features.forEach((f: any) => f.geometry?.coordinates && addCoords(f.geometry.coordinates))
    
    if (coords.length === 0) return { center: [-122.4194, 37.7749] as [number, number], zoom: 11 }
    
    const lngs = coords.map(c => c[0])
    const lats = coords.map(c => c[1])
    return {
      center: [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2] as [number, number],
      zoom: 11
    }
  }

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const view = getInitialView()
    
    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: STYLES[style],
      center: view.center,
      zoom: view.zoom,
      interactive,
      attributionControl: false,
    })

    if (interactive) {
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")
    }

    m.on("load", () => {
      map.current = m
      
      // Add data source
      m.addSource("data", { type: "geojson", data: geojson })

      // Polygon fill
      m.addLayer({
        id: "data-fill",
        type: "fill",
        source: "data",
        filter: ["==", "$type", "Polygon"],
        paint: {
          "fill-color": color,
          "fill-opacity": 0.3
        }
      })

      // Lines
      m.addLayer({
        id: "data-line",
        type: "line",
        source: "data",
        filter: ["==", "$type", "LineString"],
        paint: {
          "line-color": color,
          "line-width": 3,
          "line-opacity": 0.8
        }
      })

      // Point shadows
      m.addLayer({
        id: "data-point-shadow",
        type: "circle",
        source: "data",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 10,
          "circle-color": "#000000",
          "circle-opacity": 0.1,
          "circle-blur": 1
        }
      })

      // Points
      m.addLayer({
        id: "data-point",
        type: "circle",
        source: "data",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": color,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      })

      setLoaded(true)

      // Fit bounds with padding
      try {
        const bounds = new maplibregl.LngLatBounds()
        const addCoords = (c: any) => {
          if (Array.isArray(c) && typeof c[0] === "number") bounds.extend(c as [number, number])
          else if (Array.isArray(c)) c.forEach(addCoords)
        }
        const features = geojson?.features || [geojson]
        features.forEach((f: any) => f.geometry?.coordinates && addCoords(f.geometry.coordinates))
        if (!bounds.isEmpty()) {
          m.fitBounds(bounds, { padding: 40, maxZoom: 13, duration: animate ? 1500 : 0 })
        }
      } catch (e) {}
    })

    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`} style={{ minHeight: '250px' }}>
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  )
}
