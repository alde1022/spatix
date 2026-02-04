import React, { useState } from 'react';
import { Draggable, Droppable, DragDropContext, DropResult } from 'react-beautiful-dnd';
import { LayerPanelProps } from './types';

const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onDeleteLayer,
  onRenameLayer,
  onReorderLayers,
  onAddLayer,
}) => {

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [layerName, setLayerName] = useState<string>('');

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reorderedLayers = Array.from(layers);
    const [movedLayer] = reorderedLayers.splice(result.source.index, 1);
    reorderedLayers.splice(result.destination.index, 0, movedLayer);
    onReorderLayers(reorderedLayers);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 w-80 shadow-lg">
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
                      className={`flex items-center p-2 my-1 rounded-md cursor-pointer ${selectedLayerId === layer.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'} transition-colors duration-200`}
                      onClick={() => onSelectLayer(layer.id)}
                    >
                      <div {...provided.dragHandleProps} className="mr-2 cursor-move">
                        <span className="material-icons text-gray-400">drag_indicator</span>
                      </div>
                      <div className="flex-grow flex items-center">
                        {editingLayerId === layer.id ? (
                          <input
                            type="text"
                            className="bg-transparent border-b-2 border-blue-300 focus:outline-none"
                            value={layerName}
                            onChange={(e) => setLayerName(e.target.value)}
                            onBlur={() => {
                              onRenameLayer(layer.id, layerName);
                              setEditingLayerId(null);
                            }}
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                onRenameLayer(layer.id, layerName);
                                setEditingLayerId(null);
                              }
                            }}
                          />
                        ) : (
                          <span
                            onDoubleClick={() => {
                              setEditingLayerId(layer.id);
                              setLayerName(layer.name);
                            }}
                            className="text-white"
                          >
                            {layer.name}
                          </span>
                        )}
                      </div>
                      <button
                        className="text-gray-400 hover:text-white transition-colors duration-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleVisibility(layer.id);
                        }}
                      >
                        <span className="material-icons">
                          {layer.visible ? 'visibility' : 'visibility_off'}
                        </span>
                      </button>
                      <button
                        className="text-red-500 hover:text-red-700 transition-colors duration-200 ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteLayer(layer.id);
                        }}
                      >
                        <span className="material-icons">delete</span>
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      <button
        className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors duration-200"
        onClick={onAddLayer}
      >
        Add Layer
      </button>
    </div>
  );
};

export default LayerPanel;
