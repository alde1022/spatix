"use client"

import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

interface MapConfig {
  geojson: GeoJSON.FeatureCollection
  style: {
    fillColor: string
    fillOpacity: number
    strokeColor: string
    strokeWidth: number
    strokeOpacity: number
    pointRadius?: number
  }
  mapStyle: "light" | "dark" | "satellite"
  bounds: [[number, number], [number, number]]
  center?: [number, number]
  zoom?: number
  markers?: Array<{
    lat: number
    lng: number
    label?: string
    color?: string
  }>
}

interface MapViewerProps {
  config: MapConfig
  title?: string
  isEmbed?: boolean
}

const BASEMAPS = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  streets: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  satellite: {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
      },
    },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }],
  },
}

function parseColor(color: string, opacity: number = 1): string {
  if (color.startsWith("rgb(")) {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (match) return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`
  }
  if (color.startsWith("#")) {
    const hex = color.slice(1)
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }
  return color
}

export default function MapViewer({ config, title, isEmbed }: MapViewerProps) {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const mapStyle = config.mapStyle || "light"
    const style = BASEMAPS[mapStyle as keyof typeof BASEMAPS] || BASEMAPS.light

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: style as any,
      center: [0, 20],
      zoom: 2,
      attributionControl: isEmbed ? false : { compact: true },
    })

    if (!isEmbed) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")
    }

    map.on("load", () => {
      if (config.geojson && config.geojson.features?.length > 0) {
        map.addSource("data", { type: "geojson", data: config.geojson })

        const fillColor = config.style?.fillColor || "#3b82f6"
        const strokeColor = config.style?.strokeColor || "#1d4ed8"
        const fillOpacity = config.style?.fillOpacity ?? 0.3
        const strokeOpacity = config.style?.strokeOpacity ?? 0.8
        const strokeWidth = config.style?.strokeWidth || 2
        const pointRadius = config.style?.pointRadius || 6

        // Points - scale smoothly with zoom, use saved radius
        map.addLayer({
          id: "data-points",
          type: "circle",
          source: "data",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"],
              1, Math.max(pointRadius * 0.3, 2),
              5, Math.max(pointRadius * 0.6, 3),
              10, pointRadius,
              15, pointRadius * 1.5
            ],
            "circle-color": parseColor(fillColor, 1),
            "circle-opacity": Math.min(fillOpacity + 0.3, 1),
            "circle-stroke-color": parseColor(strokeColor, 1),
            "circle-stroke-width": 1.5,
            "circle-stroke-opacity": strokeOpacity,
          },
        })

        // Lines
        map.addLayer({
          id: "data-lines",
          type: "line",
          source: "data",
          filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
          paint: {
            "line-color": parseColor(strokeColor, 1),
            "line-width": strokeWidth,
            "line-opacity": strokeOpacity,
          },
        })

        // Polygon fills
        map.addLayer({
          id: "data-fill",
          type: "fill",
          source: "data",
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "fill-color": parseColor(fillColor, 1),
            "fill-opacity": fillOpacity,
          },
        })

        // Polygon outlines
        map.addLayer({
          id: "data-outline",
          type: "line",
          source: "data",
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "line-color": parseColor(strokeColor, 1),
            "line-width": strokeWidth,
            "line-opacity": strokeOpacity,
          },
        })

        // Fit bounds with animation
        const bounds = new maplibregl.LngLatBounds()
        config.geojson.features.forEach((f: any) => {
          const add = (c: any) => {
            if (typeof c[0] === "number") bounds.extend(c as [number, number])
            else c.forEach(add)
          }
          if (f.geometry?.coordinates) add(f.geometry.coordinates)
        })

        // Use saved center/zoom if available for exact restoration, otherwise fit bounds
        if (config.center && config.zoom) {
          map.jumpTo({ center: config.center, zoom: config.zoom })
        } else if (config.bounds?.length === 2) {
          map.fitBounds(config.bounds as any, { padding: 50, duration: 0 })
        } else if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 0 })
        }

        // Popups on click
        map.on("click", "data-points", (e) => {
          if (!e.features?.[0]) return
          const props = e.features[0].properties || {}
          const html = Object.entries(props)
            .filter(([k, v]) => v != null && !k.startsWith("_"))
            .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
            .join("<br>")
          if (html) new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map)
        })
        map.on("mouseenter", "data-points", () => { map.getCanvas().style.cursor = "pointer" })
        map.on("mouseleave", "data-points", () => { map.getCanvas().style.cursor = "" })
      }

      // Markers
      config.markers?.forEach((m) => {
        const el = document.createElement("div")
        el.style.cssText = `width:20px;height:20px;background:${m.color||"#ef4444"};border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);cursor:pointer;`
        const marker = new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map)
        if (m.label) marker.setPopup(new maplibregl.Popup().setHTML(`<strong>${m.label}</strong>`))
      })
    })

    mapRef.current = map
    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [config, isEmbed])

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: isEmbed ? "100%" : "calc(100vh - 64px)" }} />
}
