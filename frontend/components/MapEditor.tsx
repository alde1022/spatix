import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { EditControl } from 'react-leaflet-draw';
import LayerPanel from './LayerPanel';
import StyleEditor from './StyleEditor';
import DrawingToolbar from './DrawingToolbar';
import { Layer } from './types';

const defaultStyle: L.PathOptions = {
  color: '#3388ff',
  weight: 4,
  fillOpacity: 0.3,
};

const MapEditor: React.FC = () => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const featureGroupRef = useRef<L.FeatureGroup>(null);

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

  const handleCreated = (e: any) => {
    const layer = e.layer;
    if (featureGroupRef.current) {
      featureGroupRef.current.addLayer(layer);
    }
  };

  const handleStyleChange = (style: L.PathOptions) => {
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
        <MapContainer 
          className="h-full w-full" 
          center={[51.505, -0.09]} 
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FeatureGroup ref={featureGroupRef}>
            <EditControl
              position="topright"
              onCreated={handleCreated}
              draw={{
                rectangle: true,
                circle: false,
                circlemarker: false,
                marker: true,
                polyline: true,
                polygon: true,
              }}
            />
          </FeatureGroup>
        </MapContainer>
      </div>
    </div>
  );
};

export default MapEditor;
