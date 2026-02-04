import React, { useState } from 'react';

type Style = {
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  markerSize: number;
};

type StyleEditorProps = {
  style: Style;
  onStyleChange: (style: Style) => void;
};

const presetColors = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

const StyleEditor: React.FC<StyleEditorProps> = ({ style, onStyleChange }) => {
  const [showFillOptions, setShowFillOptions] = useState(true);
  const [showStrokeOptions, setShowStrokeOptions] = useState(true);
  const [showMarkerOptions, setShowMarkerOptions] = useState(true);

  const handleFillColorChange = (color: string) => {
    onStyleChange({ ...style, fillColor: color });
  };

  return (
    <div className="bg-gray-800 text-white p-4 rounded-md">
      <div>
        <button
          className="w-full text-left"
          onClick={() => setShowFillOptions(!showFillOptions)}
        >
          Fill Options
        </button>
        {showFillOptions && (
          <div className="ml-4">
            <div>
              <label className="block">Fill Color:</label>
              <div className="flex space-x-2 mt-2">
                {presetColors.map((color) => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded-full`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleFillColorChange(color)}
                  />
                ))}
                <input
                  type="color"
                  value={style.fillColor}
                  onChange={(e) => handleFillColorChange(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4">
              <label>Fill Opacity: {style.fillOpacity}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={style.fillOpacity}
                className="w-full"
                onChange={(e) => onStyleChange({ ...style, fillOpacity: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        )}
      </div>
      <div className="mt-4">
        <button
          className="w-full text-left"
          onClick={() => setShowStrokeOptions(!showStrokeOptions)}
        >
          Stroke Options
        </button>
        {showStrokeOptions && (
          <div className="ml-4">
            <div>
              <label className="block">Stroke Color:</label>
              <input
                type="color"
                value={style.strokeColor}
                onChange={(e) => onStyleChange({ ...style, strokeColor: e.target.value })}
              />
            </div>
            <div className="mt-4">
              <label>Stroke Width: {style.strokeWidth}px</label>
              <input
                type="range"
                min="0"
                max="10"
                value={style.strokeWidth}
                className="w-full"
                onChange={(e) => onStyleChange({ ...style, strokeWidth: parseInt(e.target.value, 10) })}
              />
            </div>
            <div className="mt-4">
              <label>Stroke Opacity: {style.strokeOpacity}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={style.strokeOpacity}
                className="w-full"
                onChange={(e) => onStyleChange({ ...style, strokeOpacity: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        )}
      </div>
      <div className="mt-4">
        <button
          className="w-full text-left"
          onClick={() => setShowMarkerOptions(!showMarkerOptions)}
        >
          Marker Options
        </button>
        {showMarkerOptions && (
          <div className="ml-4">
            <div>
              <label>Marker Size: {style.markerSize}px</label>
              <input
                type="range"
                min="1"
                max="50"
                value={style.markerSize}
                className="w-full"
                onChange={(e) => onStyleChange({ ...style, markerSize: parseInt(e.target.value, 10) })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StyleEditor;
