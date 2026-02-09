/**
 * MapCanvas API client
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface MapConfig {
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

export interface Map {
  id: string
  title: string
  description: string
  config: MapConfig
  created_at: string
  views: number
}

export interface CreateMapRequest {
  data: any
  title?: string
  description?: string
  style?: "auto" | "light" | "dark" | "satellite"
  markers?: Array<{
    lat: number
    lng: number
    label?: string
    color?: string
  }>
}

export interface CreateMapResponse {
  success: boolean
  id: string
  url: string
  embed: string
  preview_url?: string
}

export interface AnalyzeResponse {
  feature_count: number
  geometry_type: string[]
  crs: string | null
  bounds: number[]
  attributes: string[]
  file_size_bytes: number
  preview_geojson?: GeoJSON.FeatureCollection
}

/**
 * Analyze a GIS file
 */
export async function analyzeFile(
  file: File,
  includePreview = true
): Promise<AnalyzeResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(
    `${API_URL}/analyze?include_preview=${includePreview}`,
    {
      method: "POST",
      body: formData,
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    const detail = error.detail
    throw new Error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0]?.msg || "Validation error" : detail?.message || detail?.error || "Failed to analyze file")
  }

  return response.json()
}

/**
 * Create a new map
 */
export async function createMap(data: CreateMapRequest): Promise<CreateMapResponse> {
  const response = await fetch(`${API_URL}/api/map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    const detail = error.detail
    throw new Error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0]?.msg || "Validation error" : detail?.message || detail?.error || "Failed to create map")
  }

  return response.json()
}

/**
 * Get a map by ID
 */
export async function getMap(id: string): Promise<Map> {
  const response = await fetch(`${API_URL}/api/map/${id}`, {
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("Map not found")
  }

  return response.json()
}

/**
 * Delete a map
 */
export async function deleteMap(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/map/${id}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }))
    const detail = error.detail
    throw new Error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail[0]?.msg || "Validation error" : detail?.message || detail?.error || "Failed to delete map")
  }
}
