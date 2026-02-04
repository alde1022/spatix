import React from 'react';

interface LabelConfig {
  enabled: boolean;
  property: string;
  fontSize: number;
  fontColor: string;
  haloEnabled: boolean;
  haloColor: string;
  position: 'auto' | 'above' | 'below' | 'left' | 'right';
}

interface LabelSettingsProps {
  labelConfig: LabelConfig;
  availableProperties: string[];
  onConfigChange: (config: LabelConfig) => void;
}

const LabelSettings: React.FC<LabelSettingsProps> = ({
  labelConfig,
  availableProperties,
  onConfigChange,
}) => {
  const updateConfig = (changes: Partial<LabelConfig>) => {
    onConfigChange({ ...labelConfig, ...changes });
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg text-white space-y-4">
      <div className="flex items-center justify-between">
        <label className="font-medium">Toggle Labels</label>
        <input
          type="checkbox"
          checked={labelConfig.enabled}
          onChange={(e) => updateConfig({ enabled: e.target.checked })}
          className="form-checkbox"
        />
      </div>

      <div className="space-y-2">
        <label className="block font-medium">Property to Use as Label</label>
        <select
          value={labelConfig.property}
          onChange={(e) => updateConfig({ property: e.target.value })}
          className="w-full bg-gray-700 p-2 rounded-md"
        >
          {availableProperties.map((prop) => (
            <option key={prop} value={prop}>
              {prop}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block font-medium">Font Size</label>
        <input
          type="range"
          min={10}
          max={24}
          value={labelConfig.fontSize}
          onChange={(e) => updateConfig({ fontSize: parseInt(e.target.value, 10) })}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="block font-medium">Font Color</label>
        <input
          type="color"
          value={labelConfig.fontColor}
          onChange={(e) => updateConfig({ fontColor: e.target.value })}
          className="w-full"
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="font-medium">Toggle Text Halo</label>
        <input
          type="checkbox"
          checked={labelConfig.haloEnabled}
          onChange={(e) => updateConfig({ haloEnabled: e.target.checked })}
          className="form-checkbox"
        />
      </div>

      {labelConfig.haloEnabled && (
        <div className="space-y-2">
          <label className="block font-medium">Halo Color</label>
          <input
            type="color"
            value={labelConfig.haloColor}
            onChange={(e) => updateConfig({ haloColor: e.target.value })}
            className="w-full"
          />
        </div>
      )}

      <div className="space-y-2">
        <label className="block font-medium">Label Position</label>
        <select
          value={labelConfig.position}
          onChange={(e) => updateConfig({ position: e.target.value as LabelConfig['position'] })}
          className="w-full bg-gray-700 p-2 rounded-md"
        >
          {['auto', 'above', 'below', 'left', 'right'].map((position) => (
            <option key={position} value={position}>
              {position.charAt(0).toUpperCase() + position.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default LabelSettings;
