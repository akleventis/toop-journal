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
    function handle(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--p-out-vertical) var(--p-out-horizontal)' }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
          <div ref={dropdownRef} style={{ position: 'absolute', left: '100%', top: 0, zIndex: 1000, background: 'var(--secondary-bg)', padding: '4px', borderRadius: 'var(--border-radius)', marginLeft: '4px' }}>
            <button
              style={{ display: 'block', width: '100%', textAlign: 'left' }}
              onClick={() => { onToggleEditMode(); setShowDropdown(false); }}
            >
              Edit
            </button>
            <button
              style={{ display: 'block', width: '100%', textAlign: 'left' }}
              onClick={() => { onDelete(); setShowDropdown(false); }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={() => { onNavigate?.(NavDirection.PREV); }}> ← </button>
        <button onClick={() => { onNavigate?.(NavDirection.NEXT); }}> → </button>
      </div>
    </div>
  );
};

export default TextEditNav; 