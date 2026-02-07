// Types for Spatix map components - MapLibre based

export interface LayerStyle {
  fillColor?: string
  fillOpacity?: number
  strokeColor?: string
  strokeWidth?: number
  strokeOpacity?: number
  pointRadius?: number
}

export interface Layer {
  id: string
  name: string
  visible?: boolean
  geojson?: GeoJSON.FeatureCollection
  style: LayerStyle
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
