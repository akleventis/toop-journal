import React, { useEffect, useRef, useState } from 'react';

function lineColor(line: string): string {
  if (line.includes('[ERROR]')) return 'text-red-400';
  if (line.includes('[WARN]'))  return 'text-yellow-400';
  if (line.includes('[DEBUG]')) return 'text-gray-500';
  return 'text-gray-300'; // INFO
}

export default function Logs() {
  const [lines, setLines] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.logs) return;
    window.logs.getRecent().then(setLines);
    const cleanup = window.logs.onLine((line) => {
      setLines(prev => [...prev, line]);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [lines]);

  return (
    <div className="h-full flex flex-col bg-black overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-[1.6]">
        {lines.length === 0 && (
          <div className="text-gray-600">No logs yet.</div>
        )}
        {lines.map((line, i) => (
          <div key={i} className={lineColor(line)}>{line}</div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
