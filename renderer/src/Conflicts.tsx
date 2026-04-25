import React, { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Conflict } from '../../shared/types';
import { useNavigate } from 'react-router-dom';
import { clearDecodedCache } from '../db/db';
import { handleError } from '../lib/error-handler';

export default function Conflicts() {
    const [conflicts, setConflicts] = useState<Conflict[]>([]);
    const [selected, setSelected] = useState<Conflict | null>(null);
    const [version, setVersion] = useState<'local' | 'remote'>('local');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        loadConflicts();
    }, []);

    async function loadConflicts() {
        const data = await window.conflicts.getConflicts();
        setConflicts(data);
        if (data.length === 0) navigate('/list?reload=true');
    }

    async function handleResolve() {
        if (!selected) return;
        setLoading(true);
        try {
            await window.conflicts.resolveConflict(selected.entryId, version);
            clearDecodedCache();
            navigate('/list?reload=true');
        } catch (error) {
            handleError(error, 'Failed to resolve conflict');
        } finally {
            setLoading(false);
        }
    }

    // List view
    if (!selected) {
        return (
            <div className="p-5">
                <h2 className="text-[14px] mt-0 mb-[10px]">
                    Conflicts ({conflicts.length})
                </h2>
                {conflicts.map(c => (
                    <div
                        key={c.entryId}
                        onClick={() => setSelected(c)}
                        className="p-[10px] mb-2 bg-[color:var(--color-secondary-bg)] rounded cursor-pointer"
                    >
                        <div>{c.entryDate}</div>
                        <div className="text-[10px] text-gray-400 mt-1">
                            {new Date(c.localModified).toLocaleString()}
                        </div>
                    </div>
                ))}
                <button onClick={() => navigate('/list?reload=true')}>Back</button>
            </div>
        );
    }

    // Detail view
    return (
        <div className="p-5 h-full flex flex-col">
            <h3 className="text-[14px] text-[#e74c3c] m-0 mb-[10px]">
                {selected.entryDate}
            </h3>

            <div className="flex gap-[10px] flex-1 overflow-hidden">
                {(['local', 'remote'] as const).map(v => (
                    <div
                        key={v}
                        onClick={() => setVersion(v)}
                        className={clsx(
                            'flex-1 rounded p-[10px] cursor-pointer overflow-hidden flex flex-col',
                            version === v
                                ? 'border-2 border-current bg-[color:var(--color-third-bg)]'
                                : 'border border-[color:var(--color-third-bg)] bg-[color:var(--color-secondary-bg)]'
                        )}
                    >
                        <div className="text-[12px] font-bold mb-1">
                            {v === 'local' ? 'Local' : 'Remote'} {version === v && '✓'}
                        </div>
                        <div className="text-[10px] text-gray-400 mb-2">
                            {new Date(v === 'local' ? selected.localModified : selected.remoteModified).toLocaleString()}
                        </div>
                        <div
                            className="flex-1 overflow-auto text-[11px] p-2 rounded bg-[color:var(--color-app-bg)]"
                            dangerouslySetInnerHTML={{ __html: v === 'local' ? selected.localVersion : selected.remoteVersion }}
                        />
                    </div>
                ))}
            </div>

            <div className="flex gap-2 justify-end mt-[10px]">
                <button onClick={() => setSelected(null)} disabled={loading}>Back</button>
                <button onClick={handleResolve} disabled={loading}>
                    {loading ? 'Resolving...' : 'Keep Selected'}
                </button>
            </div>
        </div>
    );
}
