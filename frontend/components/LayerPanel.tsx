import React, { useState } from 'react';
import { Draggable, Droppable, DragDropContext, DropResult } from 'react-beautiful-dnd';
import { LayerPanelProps, Layer } from './types';

const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  selectedLayerId,
  selectedLayer,
  onSelectLayer,
  onLayerSelect,
  onToggleVisibility,
  onDeleteLayer,
  onRenameLayer,
  onReorderLayers,
  onAddLayer,
  onLayerAdd,
}) => {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerName, setLayerName] = useState<string>('');
  const [newLayerName, setNewLayerName] = useState<string>('');

  // Support both prop naming conventions
  const activeLayerId = selectedLayerId ?? selectedLayer;
  const handleSelect = onSelectLayer ?? onLayerSelect ?? (() => {});

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || !onReorderLayers) return;
    const reorderedLayers = Array.from(layers);
    const [movedLayer] = reorderedLayers.splice(result.source.index, 1);
    reorderedLayers.splice(result.destination.index, 0, movedLayer);
    onReorderLayers(reorderedLayers);
  };

  const handleAddLayer = () => {
    if (onAddLayer) {
      onAddLayer();
    } else if (onLayerAdd) {
      const name = newLayerName || `Layer ${layers.length + 1}`;
      onLayerAdd(name);
      setNewLayerName('');
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 w-80 shadow-lg">
      <h3 className="text-white text-lg font-semibold mb-3">Layers</h3>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="droppable">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              {layers.map((layer, index) => (
                <Draggable key={layer.id} draggableId={layer.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`flex items-center p-2 my-1 rounded-md cursor-pointer ${
                        activeLayerId === layer.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                      } transition-colors duration-200`}
                      onClick={() => handleSelect(layer.id)}
                    >
                      <div {...provided.dragHandleProps} className="mr-2 cursor-move">
                        <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                        </svg>
                      </div>
                      <div className="flex-grow flex items-center">
                        {editingLayerId === layer.id ? (
                          <input
                            type="text"
                            className="bg-transparent border-b-2 border-blue-300 focus:outline-none text-white w-full"
                            value={layerName}
                            onChange={(e) => setLayerName(e.target.value)}
                            onBlur={() => {
                              if (onRenameLayer) onRenameLayer(layer.id, layerName);
                              setEditingLayerId(null);
                            }}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                if (onRenameLayer) onRenameLayer(layer.id, layerName);
                                setEditingLayerId(null);
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            onDoubleClick={() => {
                              setEditingLayerId(layer.id);
                              setLayerName(layer.name);
                            }}
                            className="text-white truncate"
                          >
                            {layer.name}
                          </span>
                        )}
                      </div>
                      {onToggleVisibility && (
                        <button
                          className="text-gray-400 hover:text-white transition-colors duration-200 ml-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleVisibility(layer.id);
                          }}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {layer.visible !== false ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                            )}
                          </svg>
                        </button>
                      )}
                      {onDeleteLayer && (
                        <button
                          className="text-red-400 hover:text-red-300 transition-colors duration-200 ml-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteLayer(layer.id);
                          }}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      
      {onLayerAdd && (
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            placeholder="New layer name"
            value={newLayerName}
            onChange={(e) => setNewLayerName(e.target.value)}
            className="flex-grow px-3 py-2 bg-gray-700 text-white rounded-md text-sm"
            onKeyPress={(e) => e.key === 'Enter' && handleAddLayer()}
          />
          <button
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors duration-200 text-sm"
            onClick={handleAddLayer}
          >
            Add
          </button>
        </div>
      )}
      
      {onAddLayer && !onLayerAdd && (
        <button
          className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors duration-200"
          onClick={handleAddLayer}
        >
          Add Layer
        </button>
      )}
    </div>
  );
};

export default LayerPanel;
