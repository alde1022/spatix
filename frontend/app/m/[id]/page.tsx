import { Metadata } from "next"
import { notFound } from "next/navigation"
import dynamic from "next/dynamic"

// Client-side map component - dynamically imported (no SSR for Leaflet)
const MapViewer = dynamic(() => import("@/components/MapViewer"), { ssr: false })

interface Props {
  params: { id: string }
  searchParams: { embed?: string }
}

const API_URL = process.env.BACKEND_URL || "http://localhost:8000"

async function getMap(id: string) {
  try {
    const res = await fetch(`${API_URL}/api/map/${id}`, {
      cache: "no-store",
    })

    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const map = await getMap(params.id)

  if (!map) {
    return { title: "Map Not Found | Spatix" }
  }

  return {
    title: `${map.title || "Map"} | Spatix`,
    description: map.description || "Interactive map created with Spatix",
    openGraph: {
      title: map.title || "Map",
      description: map.description || "Interactive map created with Spatix",
      type: "website",
      images: [`https://spatix.io/api/map/${params.id}/preview.png`],
    },
    twitter: {
      card: "summary_large_image",
      title: map.title || "Map",
      description: map.description || "Interactive map created with Spatix",
    },
  }
}

export default async function MapPage({ params, searchParams }: Props) {
  const map = await getMap(params.id)

  if (!map) {
    notFound()
  }

  const isEmbed = searchParams.embed === "1"

  return (
    <div className={`w-full ${isEmbed ? "h-screen" : "min-h-screen"}`}>
      {/* Map viewer */}
      <MapViewer config={map.config} title={map.title} isEmbed={isEmbed} />

      {/* Attribution footer (not in embed mode) */}
      {!isEmbed && (
        <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur px-4 py-2 rounded-lg shadow-lg text-sm text-gray-700 z-[1000]">
          <span className="font-medium">{map.title}</span>
          {map.description && <span className="text-gray-500 ml-2">— {map.description}</span>}
          <span className="text-gray-400 mx-2">•</span>
          <a href="https://spatix.io" className="text-brand-600 hover:underline">
            Spatix
          </a>
        </div>
      )}

      {/* Embed attribution */}
      {isEmbed && (
        <div className="absolute bottom-2 right-2 bg-white/80 px-3 py-1 rounded text-xs text-gray-600 z-[1000]">
          <a href="https://spatix.io" target="_blank" className="text-brand-600 hover:underline">
            Spatix
          </a>
        </div>
      )}
    </div>
  )
}
