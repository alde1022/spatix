import React, { useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
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
};

const MapEditor: React.FC = () => {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<L.Layer | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);

  const handleAddLayer = (name: string) => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name,
      features: L.featureGroup(),
      style: { ...defaultStyle },
    };
    setLayers([...layers, newLayer]);
    setSelectedLayer(newLayer.id);
  };

  const handleLayerSelect = (layerId: string) => {
    setSelectedLayer(layerId);
    setSelectedFeature(null);
  };

  const handleFeatureAdd = (e: L.DrawEvents.Created) => {
    const activeLayer = layers.find(layer => layer.id === selectedLayer);
    if (activeLayer && activeLayer.features) {
      activeLayer.features.addLayer(e.layer);
      setLayers([...layers]);
    }
  };

  const handleFeatureClick = (layer: L.Layer) => {
    setSelectedFeature(layer);
  };

  const handleStyleChange = (style: L.PathOptions) => {
    if (selectedLayer) {
      const layerToStyle = layers.find(layer => layer.id === selectedLayer);
      if (layerToStyle && layerToStyle.features) {
        layerToStyle.style = { ...style };
        layerToStyle.features.eachLayer((layer: L.Layer) => {
          if ((layer as L.Path).setStyle) {
            (layer as L.Path).setStyle(style);
          }
        });
        setLayers([...layers]);
      }
    }
  };

  return (
    <div className="flex h-full bg-gray-900 text-white">
      <div className="flex flex-col w-1/4 bg-gray-800">
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
        <MapContainer className="h-full" center={[51.505, -0.09]} zoom={13}>
          <TileLayer
            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {layers.map((layer) =>
            <LayerComponent
              key={layer.id}
              layer={layer}
              isActive={layer.id === selectedLayer}
              onFeatureClick={handleFeatureClick}
            />
          )}
          <EditControlComponent
            onCreated={handleFeatureAdd}
            activeLayer={selectedLayer ? layers.find(layer => layer.id === selectedLayer)?.features ?? null : null}
          />
        </MapContainer>
      </div>
    </div>
  );
};

interface LayerComponentProps {
  layer: Layer;
  isActive: boolean;
  onFeatureClick: (layer: L.Layer) => void;
}

const LayerComponent: React.FC<LayerComponentProps> = ({ layer, isActive, onFeatureClick }) => {
  const map = useMap();
  if (layer.features) {
    if (isActive) {
      map.addLayer(layer.features);
      layer.features.eachLayer(l => l.on('click', () => onFeatureClick(l)));
    } else {
      map.removeLayer(layer.features);
    }
  }
  return null;
};

interface EditControlProps {
  onCreated: (e: L.DrawEvents.Created) => void;
  activeLayer: L.FeatureGroup | null;
}

const EditControlComponent: React.FC<EditControlProps> = ({ onCreated, activeLayer }) => {
  if (activeLayer) {
    return <EditControl position="topright" onCreated={onCreated} draw={{ rectangle: false, circle: false }} featureGroup={activeLayer} />;
  }
  return null;
};

export default MapEditor;
