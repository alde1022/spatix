"use client"

import { useRef, useEffect, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

// Demo data
const DEMO_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "Blue Bottle Coffee" }, geometry: { type: "Point", coordinates: [-122.4086, 37.7823] }},
    { type: "Feature", properties: { name: "Sightglass Coffee" }, geometry: { type: "Point", coordinates: [-122.4105, 37.7715] }},
    { type: "Feature", properties: { name: "Ritual Coffee" }, geometry: { type: "Point", coordinates: [-122.4215, 37.7565] }},
    { type: "Feature", properties: { name: "Philz Coffee" }, geometry: { type: "Point", coordinates: [-122.4335, 37.7642] }},
    { type: "Feature", properties: { name: "Verve Coffee" }, geometry: { type: "Point", coordinates: [-122.4052, 37.7821] }},
    { type: "Feature", properties: { name: "Embarcadero Route" }, geometry: { type: "LineString", coordinates: [[-122.393, 37.795], [-122.389, 37.790], [-122.388, 37.783], [-122.390, 37.777]] }},
    { type: "Feature", properties: { name: "Golden Gate Park" }, geometry: { type: "Polygon", coordinates: [[[-122.511, 37.771], [-122.453, 37.771], [-122.453, 37.765], [-122.511, 37.765], [-122.511, 37.771]]] }},
  ]
}

const LAYERS = [
  { name: "SF Coffee Shops", type: "point", count: 5, color: "#6366f1", visible: true },
  { name: "Embarcadero Route", type: "line", count: 1, color: "#22c55e", visible: true },
  { name: "Golden Gate Park", type: "polygon", count: 1, color: "#f59e0b", visible: true },
]

export default function HeroMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!mapContainer.current || map.current) return

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [-122.435, 37.770],
      zoom: 11.5,
      interactive: true,
      attributionControl: false,
    })

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")

    m.on("load", () => {
      map.current = m
      
      m.addSource("data", { type: "geojson", data: DEMO_GEOJSON as any })

      // Polygon fill
      m.addLayer({
        id: "polygon-fill",
        type: "fill",
        source: "data",
        filter: ["==", "$type", "Polygon"],
        paint: { "fill-color": "#f59e0b", "fill-opacity": 0.3 }
      })

      // Polygon outline
      m.addLayer({
        id: "polygon-line",
        type: "line",
        source: "data",
        filter: ["==", "$type", "Polygon"],
        paint: { "line-color": "#f59e0b", "line-width": 2 }
      })

      // Lines
      m.addLayer({
        id: "line",
        type: "line",
        source: "data",
        filter: ["==", "$type", "LineString"],
        paint: { "line-color": "#22c55e", "line-width": 4 }
      })

      // Points
      m.addLayer({
        id: "points",
        type: "circle",
        source: "data",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 8,
          "circle-color": "#6366f1",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      })

      setLoaded(true)
    })

    return () => { m.remove(); map.current = null }
  }, [])

  return (
    <div className="flex h-full bg-[#29323c]">
      {/* Sidebar */}
      <div className="w-[180px] flex-shrink-0 bg-[#29323c] border-r border-[#3a4552] flex flex-col">
        {/* Logo */}
        <div className="p-3 border-b border-[#3a4552]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-[#6b5ce7] to-[#8b7cf7] rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">🗺️</span>
            </div>
            <span className="font-semibold text-white text-sm">Spatix</span>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex text-[10px] border-b border-[#3a4552]">
          <div className="flex-1 py-2 text-center text-white bg-[#3a4552] border-b-2 border-[#6b5ce7] font-medium">Layers</div>
          <div className="flex-1 py-2 text-center text-[#6a7485]">Add Data</div>
        </div>

        {/* Layers */}
        <div className="flex-1 overflow-auto p-2 space-y-1.5">
          {LAYERS.map((layer, i) => (
            <div key={i} className="bg-[#3a4552] rounded-lg p-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: layer.color }} />
                <span className="text-white text-[10px] font-medium truncate">{layer.name}</span>
              </div>
              <div className="text-[9px] text-[#6a7485]">{layer.count} feature{layer.count > 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>

        {/* Basemap */}
        <div className="p-2 border-t border-[#3a4552]">
          <div className="text-[9px] text-[#6a7485] mb-1.5 font-medium">BASE MAP</div>
          <div className="grid grid-cols-2 gap-1">
            <div className="py-1 text-[9px] text-[#6a7485] bg-[#242730] rounded text-center">Light</div>
            <div className="py-1 text-[9px] text-white bg-[#6b5ce7] rounded text-center font-medium">Dark</div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="absolute inset-0" />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#242730]">
            <div className="animate-spin w-6 h-6 border-2 border-[#6b5ce7] border-t-transparent rounded-full" />
          </div>
        )}
      </div>
    </div>
  )
}
