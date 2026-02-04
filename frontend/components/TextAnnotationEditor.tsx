import React, { useState, useEffect } from 'react';

interface Annotation {
  text: string;
  fontFamily: 'sans-serif' | 'serif' | 'monospace';
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  border: boolean;
  borderColor: string;
  rotation: number;
}

interface TextAnnotationEditorProps {
  annotation: Annotation;
  onAnnotationChange: (updatedAnnotation: Annotation) => void;
}

const TextAnnotationEditor: React.FC<TextAnnotationEditorProps> = ({ annotation, onAnnotationChange }) => {
  const [localAnnotation, setLocalAnnotation] = useState<Annotation>(annotation);

  useEffect(() => {
    onAnnotationChange(localAnnotation);
  }, [localAnnotation, onAnnotationChange]);

  return (
    <div className="bg-gray-800 p-4 space-y-2 text-white rounded-md">
      <div className="flex items-center space-x-2">
        <label className="w-24">Text</label>
        <input
          className="flex-grow bg-gray-700 p-1 rounded"
          type="text"
          value={localAnnotation.text}
          onChange={(e) => setLocalAnnotation({ ...localAnnotation, text: e.target.value })}
        />
      </div>
      <div className="flex items-center space-x-2">
        <label className="w-24">Font Family</label>
        <select
          className="bg-gray-700 p-1 rounded"
          value={localAnnotation.fontFamily}
          onChange={(e) => setLocalAnnotation({ ...localAnnotation, fontFamily: e.target.value as Annotation['fontFamily'] })}
        >
          <option value="sans-serif">Sans-serif</option>
          <option value="serif">Serif</option>
          <option value="monospace">Monospace</option>
        </select>
      </div>
      <div className="flex items-center space-x-2">
        <label className="w-24">Font Size</label>
        <input
          className="bg-gray-700 p-1 rounded"
          type="number"
          min="12"
          max="48"
          value={localAnnotation.fontSize}
          onChange={(e) => setLocalAnnotation({ ...localAnnotation, fontSize: Number(e.target.value) })}
        />
      </div>
      <div className="flex items-center space-x-2">
        <label className="w-24">Font Weight</label>
        <select
          className="bg-gray-700 p-1 rounded"
          value={localAnnotation.fontWeight}
          onChange={(e) => setLocalAnnotation({ ...localAnnotation, fontWeight: e.target.value as Annotation['fontWeight'] })}
        >
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
        </select>
      </div>
      <div className="flex items-center space-x-2">
        <label className="w-24">Text Color</label>
        <input
          className="bg-gray-700 p-1 rounded"
          type="color"
          value={localAnnotation.textColor}
          onChange={(e) => setLocalAnnotation({ ...localAnnotation, textColor: e.target.value })}
        />
      </div>
      <div className="flex items-center space-x-2">
        <label className="w-24">Background Color</label>
        <input
          className="bg-gray-700 p-1 rounded"
          type="color"
          value={localAnnotation.backgroundColor}
          onChange={(e) => setLocalAnnotation({ ...localAnnotation, backgroundColor: e.target.value })}
        />
      </div>
      <div className="flex items-center space-x-2">
        <label className="w-24">Background Opacity</label>
        <input
          className="bg-gray-700 p-1 rounded"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={localAnnotation.backgroundOpacity}
          onChange={(e) => setLocalAnnotation({ ...localAnnotation, backgroundOpacity: Number(e.target.value) })}
        />
      </div>
      <div className="flex items-center space-x-2">
        <label className="w-24">Border</label>
        <input
          type="checkbox"
          checked={localAnnotation.border}
          onChange={(e) => setLocalAnnotation({ ...localAnnotation, border: e.target.checked })}
        />
      </div>
      {localAnnotation.border && (
        <div className="flex items-center space-x-2">
          <label className="w-24">Border Color</label>
          <input
            className="bg-gray-700 p-1 rounded"
            type="color"
            value={localAnnotation.borderColor}
            onChange={(e) => setLocalAnnotation({ ...localAnnotation, borderColor: e.target.value })}
          />
        </div>
      )}
      <div className="flex items-center space-x-2">
        <label className="w-24">Rotation</label>
        <input
          className="bg-gray-700 p-1 rounded"
          type="range"
          min="-180"
          max="180"
          value={localAnnotation.rotation}
          onChange={(e) => setLocalAnnotation({ ...localAnnotation, rotation: Number(e.target.value) })}
        />
      </div>
    </div>
  );
};

export default TextAnnotationEditor;
