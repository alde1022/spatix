import L from 'leaflet'

export interface LayerStyle {
  fillColor?: string
  fillOpacity?: number
  strokeColor?: string
  strokeWidth?: number
  strokeOpacity?: number
  pointRadius?: number
  color?: string
  weight?: number
}

export interface Layer {
  id: string
  name: string
  visible?: boolean
  geojson?: GeoJSON.FeatureCollection
  features?: L.FeatureGroup
  style: LayerStyle | L.PathOptions
}

export interface Style {
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWidth: number
  strokeOpacity: number
  markerSize: number
}

export type DrawingTool = 'select' | 'drawPoint' | 'drawLine' | 'drawPolygon' | 'drawRectangle' | 'addText'

export interface MapConfig {
  basemap: 'light' | 'dark' | 'satellite' | 'streets'
  center: [number, number]
  zoom: number
  layers: Layer[]
}

export interface LayerPanelProps {
  layers: Layer[]
  selectedLayerId?: string | null
  selectedLayer?: string | null
  onSelectLayer?: (id: string) => void
  onLayerSelect?: (id: string) => void
  onToggleVisibility?: (id: string) => void
  onDeleteLayer?: (id: string) => void
  onRenameLayer?: (id: string, name: string) => void
  onReorderLayers?: (layers: Layer[]) => void
  onAddLayer?: () => void
  onLayerAdd?: (name: string) => void
}
