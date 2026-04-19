import React, { useRef, useState, useEffect } from 'react';
import { NavDirection, settingsIcon } from '../../lib/constants';

interface TextEditNavProps {
  displayNav: boolean;
  onToggleEditMode: () => void;
  onDelete: () => void;
  onNavigate?: (direction: NavDirection) => void; // navigate to previous or next entry
}

const TextEditNav: React.FC<TextEditNavProps> = ({
  displayNav,
  onToggleEditMode,
  onDelete,
  onNavigate
}) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    function handle(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showDropdown]);

  if (!displayNav) {
    return null;
  }

  return (
    <div className="flex items-center justify-between px-5 py-[5px]">
      <div className="relative inline-block">
        <button
          className="flex items-center justify-center"
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setShowDropdown(v => !v)}
          aria-label="Settings"
        >
          <svg width="15" height="15" viewBox="0 0 90 90" fill="none">
            <path
              d={settingsIcon}
              fill="currentColor"
            />
          </svg>
        </button>
        {showDropdown && (
          <div ref={dropdownRef} className="absolute left-full top-0 z-[1000] bg-[color:var(--color-secondary-bg)] p-1 rounded-sm ml-1 flex flex-col gap-[3px]">
            <button
              className="block w-full text-left text-[12px] !py-[2px]"
              onClick={() => { onToggleEditMode(); setShowDropdown(false); }}
            >
              Edit
            </button>
            <button
              className="block w-full text-left text-[12px] !py-[2px]"
              onClick={() => { onDelete(); setShowDropdown(false); }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-1">
        <button onClick={() => { onNavigate?.(NavDirection.PREV); }}> ← </button>
        <button onClick={() => { onNavigate?.(NavDirection.NEXT); }}> → </button>
      </div>
    </div>
  );
};

export default TextEditNav; 