import React, { useState } from 'react';

type IconPickerProps = {
  selectedIcon: string;
  onSelectIcon: (icon: string) => void;
  iconColor: string;
  onColorChange: (color: string) => void;
};

const ICONS = [
  { category: 'Basic', icons: ['📍', '⭐', '❤️'] },
  { category: 'Places', icons: ['🏠', '🏢', '🏥', '🏫'] },
  { category: 'Transport', icons: ['✈️', '🚉', '🚗', '🚲', '⛵'] },
  { category: 'Nature', icons: ['🏞️', '🏖️', '⛰️'] },
  { category: 'Activities', icons: ['🚩', '⚠️', 'ℹ️'] }
];

const IconPicker: React.FC<IconPickerProps> = ({ selectedIcon, onSelectIcon, iconColor, onColorChange }) => {
  const [search, setSearch] = useState('');

  const filteredIcons = ICONS.flatMap(({ category, icons }) =>
    icons.filter(icon => icon.includes(search))
  );

  return (
    <div className="bg-gray-900 p-4 text-white w-64 h-80 overflow-auto">
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search"
          className="p-2 w-full bg-gray-800 text-white border border-gray-700 rounded"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <input
          type="color"
          value={iconColor}
          onChange={e => onColorChange(e.target.value)}
          className="w-full h-8"
        />
      </div>
      <div className="grid grid-cols-5 gap-2">
        {filteredIcons.map(icon => (
          <div
            key={icon}
            className={`p-2 cursor-pointer border transition ${
              selectedIcon === icon ? 'border-blue-500' : 'border-transparent'
            }`}
            style={{ color: iconColor }}
            onClick={() => onSelectIcon(icon)}
          >
            {icon}
          </div>
        ))}
      </div>
    </div>
  );
};

export default IconPicker;
