import React, { useState, useRef, useEffect, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { handleMissingImages } from '@/lib/mapUtils';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import LayerPanel from './LayerPanel';
import StyleEditor from './StyleEditor';
import DrawingToolbar from './DrawingToolbar';
import { Layer, LayerStyle } from './types';

const defaultStyle: LayerStyle = {
  fillColor: '#3388ff',
  fillOpacity: 0.3,
  strokeColor: '#3388ff',
  strokeWidth: 4,
  strokeOpacity: 1,
};

const BASEMAPS = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
  streets: 'https://tiles.openfreemap.org/styles/bright',
};

const MapEditor: React.FC = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const draw = useRef<MapboxDraw | null>(null);
  
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>('select');
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: BASEMAPS.dark,
      center: [-0.09, 51.505],
      zoom: 13,
      attributionControl: false,
    });

    handleMissingImages(m);
    m.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    // Initialize MapboxDraw (works with MapLibre)
    const drawControl = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      defaultMode: 'simple_select',
      styles: [
        // Polygon fill
        {
          id: 'gl-draw-polygon-fill',
          type: 'fill',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'fill-color': '#3388ff',
            'fill-outline-color': '#3388ff',
            'fill-opacity': 0.3
          }
        },
        // Polygon stroke
        {
          id: 'gl-draw-polygon-stroke',
          type: 'line',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'line-color': '#3388ff',
            'line-width': 3
          }
        },
        // Line
        {
          id: 'gl-draw-line',
          type: 'line',
          filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
          paint: {
            'line-color': '#3388ff',
            'line-width': 3
          }
        },
        // Point
        {
          id: 'gl-draw-point',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          paint: {
            'circle-radius': 6,
            'circle-color': '#3388ff'
          }
        },
        // Vertex points
        {
          id: 'gl-draw-vertex',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
          paint: {
            'circle-radius': 5,
            'circle-color': '#fff',
            'circle-stroke-color': '#3388ff',
            'circle-stroke-width': 2
          }
        },
      ]
    });

    m.on('load', () => {
      m.addControl(drawControl as any);
      draw.current = drawControl;
      map.current = m;
      setMapReady(true);
    });

    // Handle draw events
    m.on('draw.create', handleDrawCreate);
    m.on('draw.update', handleDrawUpdate);
    m.on('draw.delete', handleDrawDelete);

    return () => {
      m.remove();
      map.current = null;
      draw.current = null;
    };
  }, []);

  const handleDrawCreate = useCallback((e: any) => {
    console.log('Feature created:', e.features);
  }, []);

  const handleDrawUpdate = useCallback((e: any) => {
    console.log('Feature updated:', e.features);
  }, []);

  const handleDrawDelete = useCallback((e: any) => {
    console.log('Feature deleted:', e.features);
  }, []);

  // Handle tool changes
  useEffect(() => {
    if (!draw.current || !mapReady) return;

    switch (activeTool) {
      case 'select':
        draw.current.changeMode('simple_select');
        break;
      case 'drawPoint':
        draw.current.changeMode('draw_point');
        break;
      case 'drawLine':
        draw.current.changeMode('draw_line_string');
        break;
      case 'drawPolygon':
        draw.current.changeMode('draw_polygon');
        break;
      case 'drawRectangle':
        // MapboxDraw doesn't have native rectangle, use polygon
        draw.current.changeMode('draw_polygon');
        break;
      default:
        draw.current.changeMode('simple_select');
    }
  }, [activeTool, mapReady]);

  const handleAddLayer = (name: string) => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name,
      visible: true,
      style: { ...defaultStyle },
    };
    setLayers([...layers, newLayer]);
    setSelectedLayer(newLayer.id);
  };

  const handleLayerSelect = (layerId: string) => {
    setSelectedLayer(layerId);
  };

  const handleStyleChange = (style: any) => {
    if (selectedLayer) {
      setLayers(layers.map(layer => 
        layer.id === selectedLayer ? { ...layer, style } : layer
      ));
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      <div className="flex flex-col w-80 bg-gray-800 p-4 overflow-y-auto">
        <LayerPanel
          layers={layers}
          onLayerAdd={handleAddLayer}
          onLayerSelect={handleLayerSelect}
          selectedLayer={selectedLayer}
        />
        <StyleEditor
          style={selectedLayer ? layers.find(layer => layer.id === selectedLayer)?.style : defaultStyle}
          onStyleChange={handleStyleChange}
        />
      </div>
      <div className="relative flex-1">
        <DrawingToolbar activeTool={activeTool} onToolChange={setActiveTool} />
        <div ref={mapContainer} className="h-full w-full" />
      </div>
    </div>
  );
};

export default MapEditor;
