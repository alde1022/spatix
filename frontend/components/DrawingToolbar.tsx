import React from 'react';

type Tool = 'select' | 'drawPoint' | 'drawLine' | 'drawPolygon' | 'drawRectangle' | 'addText';

interface DrawingToolbarProps {
  activeTool: Tool;
  onSelectTool: (tool: Tool) => void;
}

const tools: { type: Tool; icon: string; label: string }[] = [
  { type: 'select', icon: '🖱️', label: 'Select' },
  { type: 'drawPoint', icon: '🟢', label: 'Draw Point' },
  { type: 'drawLine', icon: '🔶', label: 'Draw Line' },
  { type: 'drawPolygon', icon: '🔷', label: 'Draw Polygon' },
  { type: 'drawRectangle', icon: '⬛', label: 'Draw Rectangle' },
  { type: 'addText', icon: '🔤', label: 'Add Text' },
];

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({ activeTool, onSelectTool }) => {
  return (
    <div className="flex flex-col bg-gray-800 p-2 rounded-lg shadow-md space-y-2">
      {tools.map(({ type, icon, label }) => (
        <button
          key={type}
          onClick={() => onSelectTool(type)}
          className={`flex items-center justify-center w-12 h-12 text-xl
            ${activeTool === type ? 'bg-gray-600' : 'bg-gray-700'}
            hover:bg-gray-600 text-white rounded-full transition-colors duration-300`}
          title={label}
        >
          {icon}
        </button>
      ))}
    </div>
  );
};

export default DrawingToolbar;
