import React, { useState } from 'react';
import L from 'leaflet';

// Flexible style type that can accept both our Style and Leaflet PathOptions
type StyleInput = {
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  markerSize?: number;
  color?: string;
  weight?: number;
  opacity?: number;
} | L.PathOptions;

type StyleOutput = {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  markerSize: number;
};

type StyleEditorProps = {
  style?: StyleInput;
  onStyleChange: (style: StyleOutput | L.PathOptions) => void;
};

const defaultStyle: StyleOutput = {
  fillColor: '#3388ff',
  fillOpacity: 0.5,
  strokeColor: '#3388ff',
  strokeWidth: 3,
  strokeOpacity: 1,
  markerSize: 10,
};

const presetColors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#3388ff'];

// Normalize incoming style to our format
function normalizeStyle(input?: StyleInput): StyleOutput {
  if (!input) return defaultStyle;
  
  const s = input as any;
  return {
    fillColor: s.fillColor ?? s.color ?? defaultStyle.fillColor,
    fillOpacity: s.fillOpacity ?? s.opacity ?? defaultStyle.fillOpacity,
    strokeColor: s.strokeColor ?? s.color ?? defaultStyle.strokeColor,
    strokeWidth: s.strokeWidth ?? s.weight ?? defaultStyle.strokeWidth,
    strokeOpacity: s.strokeOpacity ?? s.opacity ?? defaultStyle.strokeOpacity,
    markerSize: s.markerSize ?? defaultStyle.markerSize,
  };
}

const StyleEditor: React.FC<StyleEditorProps> = ({ style: inputStyle, onStyleChange }) => {
  const style = normalizeStyle(inputStyle);
  const [showFillOptions, setShowFillOptions] = useState(true);
  const [showStrokeOptions, setShowStrokeOptions] = useState(true);
  const [showMarkerOptions, setShowMarkerOptions] = useState(false);

  const handleChange = (updates: Partial<StyleOutput>) => {
    const newStyle = { ...style, ...updates };
    // Also emit as Leaflet PathOptions for compatibility
    onStyleChange({
      ...newStyle,
      color: newStyle.strokeColor,
      weight: newStyle.strokeWidth,
      opacity: newStyle.strokeOpacity,
    });
  };

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg mt-4">
      <h3 className="text-lg font-semibold mb-3">Style</h3>
      
      {/* Fill Options */}
      <div className="mb-4">
        <button
          className="w-full text-left font-medium flex items-center justify-between py-2"
          onClick={() => setShowFillOptions(!showFillOptions)}
        >
          <span>Fill</span>
          <span>{showFillOptions ? '▼' : '▶'}</span>
        </button>
        {showFillOptions && (
          <div className="pl-2 space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Color</label>
              <div className="flex flex-wrap gap-2">
                {presetColors.map((color) => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded border-2 ${style.fillColor === color ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleChange({ fillColor: color })}
                  />
                ))}
                <input
                  type="color"
                  value={style.fillColor}
                  onChange={(e) => handleChange({ fillColor: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Opacity: {Math.round(style.fillOpacity * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={style.fillOpacity}
                className="w-full accent-blue-500"
                onChange={(e) => handleChange({ fillOpacity: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stroke Options */}
      <div className="mb-4">
        <button
          className="w-full text-left font-medium flex items-center justify-between py-2"
          onClick={() => setShowStrokeOptions(!showStrokeOptions)}
        >
          <span>Stroke</span>
          <span>{showStrokeOptions ? '▼' : '▶'}</span>
        </button>
        {showStrokeOptions && (
          <div className="pl-2 space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Color</label>
              <div className="flex flex-wrap gap-2">
                {presetColors.map((color) => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded border-2 ${style.strokeColor === color ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleChange({ strokeColor: color })}
                  />
                ))}
                <input
                  type="color"
                  value={style.strokeColor}
                  onChange={(e) => handleChange({ strokeColor: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Width: {style.strokeWidth}px
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={style.strokeWidth}
                className="w-full accent-blue-500"
                onChange={(e) => handleChange({ strokeWidth: parseInt(e.target.value, 10) })}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Opacity: {Math.round(style.strokeOpacity * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={style.strokeOpacity}
                className="w-full accent-blue-500"
                onChange={(e) => handleChange({ strokeOpacity: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Marker Options */}
      <div>
        <button
          className="w-full text-left font-medium flex items-center justify-between py-2"
          onClick={() => setShowMarkerOptions(!showMarkerOptions)}
        >
          <span>Markers</span>
          <span>{showMarkerOptions ? '▼' : '▶'}</span>
        </button>
        {showMarkerOptions && (
          <div className="pl-2 space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Size: {style.markerSize}px
              </label>
              <input
                type="range"
                min="4"
                max="30"
                value={style.markerSize}
                className="w-full accent-blue-500"
                onChange={(e) => handleChange({ markerSize: parseInt(e.target.value, 10) })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StyleEditor;
