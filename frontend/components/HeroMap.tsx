"use client"

import { useRef, useEffect, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { handleMissingImages } from "@/lib/mapUtils"

type VizType = "points" | "bubbles" | "heatmap"

// Dense SF data for a visually impressive heatmap
const SF_DATA: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    // Mission District cluster
    { type: "Feature", properties: { name: "Tartine Bakery", value: 72 }, geometry: { type: "Point", coordinates: [-122.4240, 37.7614] }},
    { type: "Feature", properties: { name: "Bi-Rite Creamery", value: 68 }, geometry: { type: "Point", coordinates: [-122.4256, 37.7616] }},
    { type: "Feature", properties: { name: "Dolores Park Cafe", value: 55 }, geometry: { type: "Point", coordinates: [-122.4264, 37.7596] }},
    { type: "Feature", properties: { name: "Dandelion Chocolate", value: 63 }, geometry: { type: "Point", coordinates: [-122.4168, 37.7633] }},
    { type: "Feature", properties: { name: "Ritual Coffee", value: 58 }, geometry: { type: "Point", coordinates: [-122.4215, 37.7565] }},
    { type: "Feature", properties: { name: "La Taqueria", value: 80 }, geometry: { type: "Point", coordinates: [-122.4213, 37.7510] }},
    { type: "Feature", properties: { name: "Flour + Water", value: 71 }, geometry: { type: "Point", coordinates: [-122.4120, 37.7576] }},
    // SOMA / Downtown cluster
    { type: "Feature", properties: { name: "Blue Bottle SOMA", value: 62 }, geometry: { type: "Point", coordinates: [-122.4002, 37.7826] }},
    { type: "Feature", properties: { name: "Sightglass", value: 59 }, geometry: { type: "Point", coordinates: [-122.4105, 37.7715] }},
    { type: "Feature", properties: { name: "Wrecking Ball", value: 48 }, geometry: { type: "Point", coordinates: [-122.3987, 37.7756] }},
    { type: "Feature", properties: { name: "Benu", value: 85 }, geometry: { type: "Point", coordinates: [-122.3990, 37.7860] }},
    { type: "Feature", properties: { name: "Mourad", value: 73 }, geometry: { type: "Point", coordinates: [-122.3955, 37.7900] }},
    // North Beach / Chinatown cluster
    { type: "Feature", properties: { name: "Tosca Cafe", value: 64 }, geometry: { type: "Point", coordinates: [-122.4063, 37.7978] }},
    { type: "Feature", properties: { name: "Caffe Trieste", value: 50 }, geometry: { type: "Point", coordinates: [-122.4071, 37.7981] }},
    { type: "Feature", properties: { name: "Golden Boy Pizza", value: 66 }, geometry: { type: "Point", coordinates: [-122.4059, 37.7993] }},
    { type: "Feature", properties: { name: "R&G Lounge", value: 70 }, geometry: { type: "Point", coordinates: [-122.4045, 37.7942] }},
    { type: "Feature", properties: { name: "City Lights", value: 45 }, geometry: { type: "Point", coordinates: [-122.4066, 37.7976] }},
    // Hayes Valley / Alamo Square
    { type: "Feature", properties: { name: "Stanza", value: 55 }, geometry: { type: "Point", coordinates: [-122.4312, 37.7762] }},
    { type: "Feature", properties: { name: "Souvla", value: 60 }, geometry: { type: "Point", coordinates: [-122.4253, 37.7767] }},
    { type: "Feature", properties: { name: "Rich Table", value: 78 }, geometry: { type: "Point", coordinates: [-122.4261, 37.7770] }},
    { type: "Feature", properties: { name: "Alamo Drafthouse", value: 52 }, geometry: { type: "Point", coordinates: [-122.4370, 37.7760] }},
    // Marina / Cow Hollow
    { type: "Feature", properties: { name: "A16", value: 65 }, geometry: { type: "Point", coordinates: [-122.4360, 37.7990] }},
    { type: "Feature", properties: { name: "Greens", value: 58 }, geometry: { type: "Point", coordinates: [-122.4318, 37.8060] }},
    { type: "Feature", properties: { name: "Blue Barn", value: 47 }, geometry: { type: "Point", coordinates: [-122.4388, 37.7995] }},
    // Castro / Noe Valley
    { type: "Feature", properties: { name: "Frances", value: 82 }, geometry: { type: "Point", coordinates: [-122.4341, 37.7522] }},
    { type: "Feature", properties: { name: "Firefly", value: 61 }, geometry: { type: "Point", coordinates: [-122.4358, 37.7507] }},
    { type: "Feature", properties: { name: "Philz Castro", value: 54 }, geometry: { type: "Point", coordinates: [-122.4335, 37.7612] }},
    // Financial District
    { type: "Feature", properties: { name: "Perbacco", value: 74 }, geometry: { type: "Point", coordinates: [-122.4003, 37.7929] }},
    { type: "Feature", properties: { name: "Kokkari", value: 88 }, geometry: { type: "Point", coordinates: [-122.3995, 37.7960] }},
    { type: "Feature", properties: { name: "Yank Sing", value: 69 }, geometry: { type: "Point", coordinates: [-122.3935, 37.7908] }},
    // Embarcadero
    { type: "Feature", properties: { name: "Slanted Door", value: 76 }, geometry: { type: "Point", coordinates: [-122.3937, 37.7955] }},
    { type: "Feature", properties: { name: "Hog Island", value: 67 }, geometry: { type: "Point", coordinates: [-122.3938, 37.7960] }},
    { type: "Feature", properties: { name: "Ferry Building", value: 90 }, geometry: { type: "Point", coordinates: [-122.3934, 37.7955] }},
    // Fillmore / Western Addition
    { type: "Feature", properties: { name: "State Bird", value: 86 }, geometry: { type: "Point", coordinates: [-122.4390, 37.7873] }},
    { type: "Feature", properties: { name: "4505 Meats", value: 57 }, geometry: { type: "Point", coordinates: [-122.4368, 37.7836] }},
    { type: "Feature", properties: { name: "The Mill", value: 51 }, geometry: { type: "Point", coordinates: [-122.4380, 37.7770] }},
    // Potrero Hill / Dogpatch
    { type: "Feature", properties: { name: "Piccino", value: 60 }, geometry: { type: "Point", coordinates: [-122.3910, 37.7578] }},
    { type: "Feature", properties: { name: "Serpentine", value: 53 }, geometry: { type: "Point", coordinates: [-122.3918, 37.7573] }},
    // Haight
    { type: "Feature", properties: { name: "Magnolia Brewing", value: 56 }, geometry: { type: "Point", coordinates: [-122.4465, 37.7698] }},
    { type: "Feature", properties: { name: "Cha Cha Cha", value: 62 }, geometry: { type: "Point", coordinates: [-122.4470, 37.7695] }},
    // Sunset
    { type: "Feature", properties: { name: "Andytown", value: 49 }, geometry: { type: "Point", coordinates: [-122.5070, 37.7559] }},
    { type: "Feature", properties: { name: "Devil's Teeth", value: 55 }, geometry: { type: "Point", coordinates: [-122.5095, 37.7566] }},
  ]
}

export default function HeroMap() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [vizType, setVizType] = useState<VizType>("heatmap")
  const [mapLoaded, setMapLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapContainer.current) {
      setError("No container")
      return
    }
    if (map.current) return

    try {
      const m = new maplibregl.Map({
        container: mapContainer.current,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [-122.42, 37.775],
        zoom: 12.5,
        attributionControl: false,
        pitch: 0,
      })

      handleMissingImages(m)
      m.scrollZoom.disable()
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")

      m.on("load", () => {
        map.current = m

        m.addSource("spots", { type: "geojson", data: SF_DATA })

        // Points layer - glowing dots on dark background
        m.addLayer({
          id: "layer-points",
          type: "circle",
          source: "spots",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              10, 4,
              14, 8,
              16, 12
            ],
            "circle-color": "#a78bfa",
            "circle-stroke-width": 2,
            "circle-stroke-color": "rgba(167, 139, 250, 0.3)",
            "circle-blur": 0.1,
            "circle-opacity": 0.9,
          }
        })

        // Points glow effect (underneath)
        m.addLayer({
          id: "layer-points-glow",
          type: "circle",
          source: "spots",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["zoom"],
              10, 12,
              14, 20,
              16, 28
            ],
            "circle-color": "#7c3aed",
            "circle-opacity": 0.15,
            "circle-blur": 1,
          }
        }, "layer-points")

        // Bubbles layer - sized by value
        m.addLayer({
          id: "layer-bubbles",
          type: "circle",
          source: "spots",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": [
              "interpolate", ["linear"], ["get", "value"],
              40, 6,
              60, 14,
              90, 24
            ],
            "circle-color": [
              "interpolate", ["linear"], ["get", "value"],
              40, "#06b6d4",
              60, "#f59e0b",
              80, "#ef4444"
            ],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "rgba(255,255,255,0.4)",
            "circle-opacity": 0.85,
            "circle-blur": 0.05,
          }
        })

        // Heatmap layer - vibrant warm gradient on dark map
        m.addLayer({
          id: "layer-heatmap",
          type: "heatmap",
          source: "spots",
          paint: {
            "heatmap-weight": [
              "interpolate", ["linear"], ["get", "value"],
              40, 0.2,
              60, 0.6,
              90, 1
            ],
            "heatmap-intensity": [
              "interpolate", ["linear"], ["zoom"],
              10, 0.8,
              13, 2,
              16, 3
            ],
            "heatmap-radius": [
              "interpolate", ["linear"], ["zoom"],
              10, 20,
              13, 40,
              16, 60
            ],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0,    "rgba(0, 0, 0, 0)",
              0.1,  "rgba(103, 58, 183, 0.4)",
              0.25, "rgba(156, 39, 176, 0.6)",
              0.4,  "#e91e63",
              0.55, "#ff5722",
              0.7,  "#ff9800",
              0.85, "#ffeb3b",
              1,    "#ffffff"
            ],
            "heatmap-opacity": 0.85,
          }
        })

        setMapLoaded(true)
      })

      m.on("error", (e) => {
        setError(e.error?.message || "Map error")
      })

    } catch (e: any) {
      setError(e.message || "Failed to init map")
    }

    return () => {
      if (map.current) {
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !mapLoaded) return

    const layerMap: Record<VizType, string[]> = {
      points: ["layer-points", "layer-points-glow"],
      bubbles: ["layer-bubbles"],
      heatmap: ["layer-heatmap"],
    }
    const allLayers = Object.values(layerMap).flat()

    allLayers.forEach(id => {
      if (m.getLayer(id)) {
        const visible = layerMap[vizType].includes(id)
        m.setLayoutProperty(id, "visibility", visible ? "visible" : "none")
      }
    })
  }, [vizType, mapLoaded])

  if (error) {
    return (
      <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-slate-900 text-red-400 text-sm">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="w-full h-full min-h-[300px] relative bg-[#0d1117]">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" style={{ minHeight: '300px' }} />

      {mapLoaded && (
        <>
          <div className="absolute top-3 left-3 flex gap-1 bg-black/60 backdrop-blur-md rounded-lg p-1 shadow-lg z-10 border border-white/10">
            {(["points", "bubbles", "heatmap"] as VizType[]).map((id) => (
              <button
                key={id}
                onClick={() => setVizType(id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                  vizType === id ? "bg-violet-600 text-white shadow-md" : "text-white/60 hover:text-white hover:bg-white/10"
                }`}
              >
                {id}
              </button>
            ))}
          </div>

          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md rounded-lg px-3 py-1.5 shadow-lg z-10 text-xs border border-white/10">
            <span className="font-semibold text-white/90">40 Hotspots</span>
            <span className="text-white/40 ml-1">· San Francisco</span>
          </div>
        </>
      )}

      {!mapLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
          <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  )
}
