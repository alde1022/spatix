import React from 'react';

type Tool = 'select' | 'drawPoint' | 'drawLine' | 'drawPolygon' | 'drawRectangle' | 'addText';

interface DrawingToolbarProps {
  activeTool: Tool | string | null;
  onToolChange?: (tool: Tool) => void;
  onSelectTool?: (tool: Tool) => void;
}

const tools: { type: Tool; icon: string; label: string }[] = [
  { type: 'select', icon: '🖱️', label: 'Select' },
  { type: 'drawPoint', icon: '📍', label: 'Point' },
  { type: 'drawLine', icon: '📏', label: 'Line' },
  { type: 'drawPolygon', icon: '⬡', label: 'Polygon' },
  { type: 'drawRectangle', icon: '⬜', label: 'Rectangle' },
  { type: 'addText', icon: '🔤', label: 'Text' },
];

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({ activeTool, onToolChange, onSelectTool }) => {
  const handleSelect = onToolChange ?? onSelectTool ?? (() => {});
  
  return (
    <div className="absolute top-4 left-4 z-[1000] bg-gray-800 rounded-lg shadow-lg p-2 flex flex-col gap-1">
      {tools.map(({ type, icon, label }) => (
        <button
          key={type}
          onClick={() => handleSelect(type)}
          className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
            activeTool === type
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:bg-gray-700'
          }`}
          title={label}
        >
          <span className="text-lg">{icon}</span>
          <span className="text-sm">{label}</span>
        </button>
      ))}
    </div>
  );
};

export default DrawingToolbar;
