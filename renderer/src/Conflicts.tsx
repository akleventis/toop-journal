import React, { useEffect, useState } from 'react';
import { Conflict } from '../lib/types';
import { useNavigate } from 'react-router-dom';
import { decodeHtmlEntities } from '../lib/utils';
import { clearDecodedCache } from '../db/db';

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
            alert('Failed: ' + error);
        } finally {
            setLoading(false);
        }
    }

    // List view
    if (!selected) {
        return (
            <div style={{ padding: '20px' }}>
                <h2 style={{ fontSize: '14px', marginTop: 0, marginBottom: '10px' }}>
                    Conflicts ({conflicts.length})
                </h2>
                {conflicts.map(c => (
                    <div
                        key={c.entryId}
                        onClick={() => setSelected(c)}
                        style={{
                            padding: '10px',
                            marginBottom: '8px',
                            background: 'var(--secondary-bg)',
                            borderRadius: 'var(--border-radius)',
                            cursor: 'pointer'
                        }}
                    >
                        <div>{c.entryDate}</div>
                        <div style={{ fontSize: '10px', color: 'gray', marginTop: '4px' }}>
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
        <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '14px', color: '#e74c3c', margin: '0 0 10px 0' }}>
                {selected.entryDate}
            </h3>

            <div style={{ display: 'flex', gap: '10px', flex: 1, overflow: 'hidden' }}>
                {(['local', 'remote'] as const).map(v => (
                    <div
                        key={v}
                        onClick={() => setVersion(v)}
                        style={{
                            flex: 1,
                            border: version === v ? '2px solid var(--text-color)' : '1px solid var(--border-color)',
                            borderRadius: 'var(--border-radius)',
                            padding: '10px',
                            cursor: 'pointer',
                            background: version === v ? 'var(--third-bg)' : 'var(--secondary-bg)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                            {v === 'local' ? 'Local' : 'Remote'} {version === v && '✓'}
                        </div>
                        <div style={{ fontSize: '10px', color: 'gray', marginBottom: '8px' }}>
                            {new Date(v === 'local' ? selected.localModified : selected.remoteModified).toLocaleString()}
                        </div>
                        <div
                            style={{
                                flex: 1,
                                overflow: 'auto',
                                fontSize: '11px',
                                padding: '8px',
                                borderRadius: 'var(--border-radius)',
                                background: 'var(--app-bg)'
                            }}
                            dangerouslySetInnerHTML={{ __html: decodeHtmlEntities(v === 'local' ? selected.localVersion : selected.remoteVersion) }}
                        />
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button onClick={() => setSelected(null)} disabled={loading}>
                    Back
                </button>
                <button onClick={handleResolve} disabled={loading}>
                    {loading ? 'Resolving...' : 'Keep Selected'}
                </button>
            </div>
        </div>
    );
}
