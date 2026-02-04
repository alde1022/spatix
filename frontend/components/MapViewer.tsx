"use client"

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

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

// Tile layer URLs
const TILE_LAYERS = {
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
}

const TILE_ATTRIBUTION = {
  light: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  satellite: "&copy; Esri",
}

export default function MapViewer({ config, title, isEmbed }: MapViewerProps) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Initialize map
    const map = L.map(containerRef.current, {
      zoomControl: !isEmbed,
      attributionControl: true,
    })
    mapRef.current = map

    // Add tile layer
    const mapStyle = config.mapStyle || "light"
    L.tileLayer(TILE_LAYERS[mapStyle], {
      attribution: TILE_ATTRIBUTION[mapStyle],
      maxZoom: 19,
    }).addTo(map)

    // Add GeoJSON layer
    if (config.geojson && config.geojson.features?.length > 0) {
      const geoJsonLayer = L.geoJSON(config.geojson, {
        style: () => ({
          fillColor: config.style?.fillColor || "#3b82f6",
          fillOpacity: config.style?.fillOpacity ?? 0.3,
          color: config.style?.strokeColor || "#1d4ed8",
          weight: config.style?.strokeWidth || 2,
          opacity: config.style?.strokeOpacity ?? 0.8,
        }),
        pointToLayer: (feature, latlng) => {
          return L.circleMarker(latlng, {
            radius: config.style?.pointRadius || 8,
            fillColor: config.style?.fillColor || "#3b82f6",
            fillOpacity: config.style?.fillOpacity ?? 0.8,
            color: config.style?.strokeColor || "#1d4ed8",
            weight: config.style?.strokeWidth || 2,
            opacity: config.style?.strokeOpacity ?? 1,
          })
        },
        onEachFeature: (feature, layer) => {
          // Add popup with properties
          if (feature.properties && Object.keys(feature.properties).length > 0) {
            const props = feature.properties
            const content = Object.entries(props)
              .filter(([_, v]) => v !== null && v !== undefined)
              .map(([k, v]) => `<strong>${k}:</strong> ${v}`)
              .join("<br>")
            if (content) {
              layer.bindPopup(content)
            }
          }
        },
      }).addTo(map)

      // Fit to GeoJSON bounds
      const bounds = geoJsonLayer.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] })
      }
    }

    // Add markers
    if (config.markers && config.markers.length > 0) {
      const markerBounds: L.LatLngExpression[] = []

      config.markers.forEach((marker) => {
        const markerIcon = L.divIcon({
          className: "custom-marker",
          html: `
            <div style="
              background: ${marker.color || "#ef4444"};
              width: 24px;
              height: 24px;
              border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg);
              border: 2px solid white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            "></div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 24],
          popupAnchor: [0, -24],
        })

        const m = L.marker([marker.lat, marker.lng], { icon: markerIcon }).addTo(map)

        if (marker.label) {
          m.bindPopup(`<strong>${marker.label}</strong>`)
          m.bindTooltip(marker.label, {
            permanent: false,
            direction: "top",
            offset: [0, -20],
          })
        }

        markerBounds.push([marker.lat, marker.lng])
      })

      // If no GeoJSON, fit to markers
      if (!config.geojson?.features?.length && markerBounds.length > 0) {
        if (markerBounds.length === 1) {
          map.setView(markerBounds[0] as L.LatLngExpression, 13)
        } else {
          map.fitBounds(markerBounds as L.LatLngBoundsExpression, { padding: [50, 50] })
        }
      }
    }

    // Override with explicit center/zoom if provided
    if (config.center) {
      map.setView([config.center[1], config.center[0]], config.zoom || 10)
    }

    // Use explicit bounds if not auto
    if (config.bounds && Array.isArray(config.bounds) && config.bounds.length === 2) {
      const [[swLng, swLat], [neLng, neLat]] = config.bounds
      map.fitBounds([
        [swLat, swLng],
        [neLat, neLng],
      ])
    }

    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [config, isEmbed])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: isEmbed ? "100%" : "calc(100vh - 64px)" }}
    />
  )
}
