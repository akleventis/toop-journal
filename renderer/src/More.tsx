import React, { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import { usePasswordProtection, useSyncState } from '../lib/hooks'
import { S3Config, SyncState, HealthCheck } from '../../shared/types'
import { networkManager } from '../lib/network-manager'
import { handleError } from '../lib/error-handler'
import { formatBytes, formatRelativeTime } from '../lib/format'
import * as db from '../db/db'
import { useNavigate } from 'react-router-dom'
import Modal from './components/Modal'

export default function More() {
    return (
        <div className="h-full overflow-y-auto">
            <div className="flex flex-col gap-3 p-4 pb-4 max-w-[440px] mx-auto">
                <p className="section-label mt-1">Settings</p>

                <div className="card">
                    <Password />
                    <hr className="setting-divider" />
                    <AWSConfig />
                </div>

                <div className="card">
                    <EntryLimit />
                    <hr className="setting-divider" />
                    <SearchLimit />
                </div>

                <div className="card">
                    <ExportEntries />
                </div>

                <div className="card">
                    <ConflictsNav />
                    <LogsNav />
                    <BackupsNav />
                </div>

                <div className="card">
                    <HealthCheckWidget />
                </div>
            </div>
        </div>
    )
}

export function LogsNav() {
    const navigate = useNavigate();
    return (
        <div className="nav-row" onClick={() => navigate('/logs')}>
            <span>Logs</span>
            <span className="text-muted">›</span>
        </div>
    );
}

export function BackupsNav() {
    const navigate = useNavigate();
    return (
        <div className="nav-row" onClick={() => navigate('/backups')}>
            <span>Backups</span>
            <span className="text-muted">›</span>
        </div>
    );
}

export function ConflictsNav() {
    const [conflictCount, setConflictCount] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        async function checkConflicts() {
            const count = await window.conflicts.getConflictCount();
            setConflictCount(count);
        }
        checkConflicts();
    }, []);

    if (conflictCount === 0) return null;

    return (
        <div className="nav-row" onClick={() => navigate('/conflicts')}>
            <span>Conflicts</span>
            <div className="flex items-center gap-2">
                <span
                    className="text-[10px] font-semibold px-2 py-[2px] rounded-full text-white"
                    style={{ backgroundColor: 'var(--color-error)' }}
                >
                    {conflictCount}
                </span>
                <span className="text-muted">›</span>
            </div>
        </div>
    );
}

export function HealthCheckWidget() {
    const [health, setHealth] = useState<HealthCheck | null>(null);
    const [running, setRunning] = useState(false);

    const run = async () => {
        setRunning(true);
        try {
            const result = await window.health.run();
            setHealth(result);
        } catch (error) {
            handleError(error, 'Health check failed');
        } finally {
            setRunning(false);
        }
    };

    const statusIcon = (ok: boolean | null) => {
        if (ok === null) return <span className="text-[11px] text-muted">N/A</span>;
        return <span style={{ color: ok ? 'var(--color-success)' : 'var(--color-error)' }}>{ok ? '✓' : '✗'}</span>;
    };

    const rows: [string, React.ReactNode][] = health ? [
        ['Database', statusIcon(health.databaseIntegrity)],
        ['Master Index', statusIcon(health.masterIndexIntegrity)],
        ['S3 Connectivity', statusIcon(health.s3Connectivity)],
        ['Disk Free', <span key="disk">{formatBytes(health.diskSpace)}</span>],
        ['Last Sync', <span key="sync" className="text-muted">{formatRelativeTime(health.lastSyncTime)}</span>],
    ] : [];

    return (
        <div>
            <p className="section-label">System Health</p>
            <div className="flex justify-center mb-3">
                <button onClick={run} disabled={running}>
                    {running ? 'Checking…' : 'Run Health Check'}
                </button>
            </div>
            {health && (
                <div className="flex flex-col gap-2">
                    {rows.map(([label, value]) => (
                        <div key={label} className="flex justify-between items-center text-[12px]">
                            <span className="text-muted">{label}</span>
                            {value}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


export function EntryLimit() {
    const navigate = useNavigate()
    const [limit, setLimit] = useState<string>('')
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        const stored = localStorage.getItem('entryLimit') || ''
        setLimit(stored)
    }, [])

    const handleSave = () => {
        const trimmed = limit.trim()
        if (!trimmed) {
            localStorage.removeItem('entryLimit')
        } else {
            const parsed = parseInt(trimmed, 10)
            if (isNaN(parsed) || parsed <= 0) {
                alert('Please enter a valid number')
                return
            }
            localStorage.setItem('entryLimit', trimmed)
        }
        setSaved(true)
        db.clearDecodedCache()
        setTimeout(() => navigate('/list?reload=true'), 500)
    }

    return (
        <div>
            <p className="section-label">Entry Load Limit</p>
            <div className="flex gap-2 items-center">
                <input
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="All entries"
                    className="flex-1"
                />
                <button onClick={handleSave}>{saved ? 'Saved ✓' : 'Save'}</button>
            </div>
        </div>
    )
}

export function SearchLimit() {
    const [limit, setLimit] = useState<string>('')
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        setLimit(localStorage.getItem('searchLimit') || '')
    }, [])

    const handleSave = () => {
        const trimmed = limit.trim()
        if (!trimmed) {
            localStorage.removeItem('searchLimit')
        } else {
            const parsed = parseInt(trimmed, 10)
            if (isNaN(parsed) || parsed <= 0) {
                alert('Please enter a valid number')
                return
            }
            localStorage.setItem('searchLimit', trimmed)
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }

    return (
        <div>
            <p className="section-label">Search Result Limit</p>
            <div className="flex gap-2 items-center">
                <input
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="All results"
                    className="flex-1"
                />
                <button onClick={handleSave}>{saved ? 'Saved ✓' : 'Save'}</button>
            </div>
        </div>
    )
}

export function ExportEntries() {
    const today = new Date()
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    const [startDate, setStartDate] = useState(firstDayOfMonth.toLocaleDateString('en-CA'))
    const [endDate, setEndDate] = useState(today.toLocaleDateString('en-CA'))
    const [format, setFormat] = useState('html')
    const [isExporting, setIsExporting] = useState(false)

    const handleExport = async () => {
        if (!startDate || !endDate) {
            alert('Please select start and end dates')
            return
        }

        setIsExporting(true)
        try {
            const startTs = new Date(startDate).getTime()
            const endTs = new Date(endDate).getTime()
            const entries = await db.getEntriesBetweenTimestamps(startTs, endTs)

            if (entries.length === 0) {
                alert('No entries found in selected date range')
                return
            }

            const filename = `journal_export_${startDate}_${endDate}`

            if (format === 'pdf') {
                const doc = new jsPDF({ unit: 'pt', format: 'letter' })
                const margin = 40
                const pageWidth = doc.internal.pageSize.getWidth()
                const pageHeight = doc.internal.pageSize.getHeight()
                const maxWidth = pageWidth - margin * 2
                let y = margin

                const checkY = (needed: number) => {
                    if (y + needed > pageHeight - margin) {
                        doc.addPage()
                        y = margin
                    }
                }

                for (const entry of entries) {
                    doc.setFontSize(13)
                    doc.setFont('helvetica', 'bold')
                    checkY(20)
                    doc.text(entry.date, margin, y)
                    y += 18

                    if (entry.location) {
                        doc.setFontSize(9)
                        doc.setFont('helvetica', 'italic')
                        checkY(14)
                        doc.text(entry.location, margin, y)
                        y += 14
                    }

                    const div = document.createElement('div')
                    div.innerHTML = entry.content
                    const plainText = (div.textContent || '').trim()

                    doc.setFontSize(10)
                    doc.setFont('helvetica', 'normal')
                    const lines = doc.splitTextToSize(plainText, maxWidth) as string[]
                    for (const line of lines) {
                        checkY(13)
                        doc.text(line, margin, y)
                        y += 13
                    }

                    y += 12
                }

                const blob = doc.output('blob')
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = filename + '.pdf'
                a.click()
                URL.revokeObjectURL(url)
                return
            }

            let content = ''

            switch (format) {
                case 'html':
                    content = entries.map(entry =>
                        `<div><h3>${entry.date}</h3>${entry.content}</div><hr>`
                    ).join('')
                    content = `<html><body>${content}</body></html>`
                    break
                case 'json':
                    content = JSON.stringify(entries, null, 2)
                    break
                case 'csv':
                    content = 'Date,Location,Content\n'
                    content += entries.map(entry =>
                        `"${entry.date}","${(entry.location || '').replace(/"/g, '""')}","${entry.content.replace(/"/g, '""')}"` 
                    ).join('\n')
                    break
                case 'txt':
                    content = entries.map(entry =>
                        `${entry.date}\n${entry.content}\n${entry.location || ''}\n---\n`
                    ).join('\n')
                    break
                case 'encoded_html': {
                    const encodedEntries = entries.map(entry => ({
                        id: entry.id,
                        date: entry.date,
                        location: entry.location || '',
                        content: entry.content,
                        timestamp: entry.timestamp
                    }))
                    content = JSON.stringify(encodedEntries, null, 2)
                    break
                }
            }

            const ext: Record<string, string> = { html: '.html', json: '.json', csv: '.csv', txt: '.txt', encoded_html: '.json' }
            const blob = new Blob([content], { type: 'text/plain' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename + (ext[format] ?? '')
            a.click()
            URL.revokeObjectURL(url)
        } catch (error) {
            handleError(error, 'Export failed')
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div>
            <p className="section-label">Export</p>
            <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">Start</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">End</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">Format</label>
                    <select value={format} onChange={(e) => setFormat(e.target.value)}>
                        <option value="html">HTML</option>
                        <option value="json">JSON</option>
                        <option value="csv">CSV</option>
                        <option value="txt">TXT</option>
                        <option value="encoded_html">Encoded HTML</option>
                        <option value="pdf">PDF</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1 justify-end">
                    <button onClick={handleExport} disabled={isExporting}>
                        {isExporting ? 'Exporting…' : 'Export'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export function Password() {
    const [showPasswordInput, setShowPasswordInput] = useState(false)
    const [password, setPassword] = useState('')
    const { passwordProtected, updatePasswordProtection } = usePasswordProtection()

    const handleTogglePassword = async () => {
        if (passwordProtected) {
            await db.clearPasswordCredentials()
            setShowPasswordInput(false)
            setPassword('')
            await updatePasswordProtection()
            return
        }
        setShowPasswordInput(true)
    }

    const handlePasswordSubmit = async () => {
        if (!password.trim()) return
        if (!passwordProtected) {
            try {
                const { hash, salt } = await window.security.hashPassword(password)
                await db.setPasswordHash(hash)
                await db.setPasswordSalt(salt)
                setShowPasswordInput(false)
                setPassword('')
                await updatePasswordProtection()
            } catch (error) {
                handleError(error, 'Error enabling password')
            }
        }
    }

    const handleCancel = () => {
        setShowPasswordInput(false)
        setPassword('')
    }

    return (
        <div>
            <p className="section-label">Security</p>
            <div className="flex items-center justify-between">
                <span className="text-[13px]">Password Protection</span>
                <div
                    onClick={handleTogglePassword}
                    className="toggle"
                    style={{ background: passwordProtected ? 'var(--color-accent)' : 'rgba(128,128,128,0.4)' }}
                >
                    <div
                        className="toggle-slider"
                        style={{ left: passwordProtected ? '18px' : '2px' }}
                    />
                </div>
            </div>

            <Modal isOpen={showPasswordInput} title="Password Protection" onClose={handleCancel}>
                <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={passwordProtected ? 'Enter current password' : 'Enter new password'}
                    autoFocus
                    className="w-full"
                />
                <div className="flex gap-2 justify-end mt-1">
                    <button onClick={handleCancel}>Cancel</button>
                    <button onClick={handlePasswordSubmit}>
                        {passwordProtected ? 'Disable' : 'Enable'}
                    </button>
                </div>
            </Modal>
        </div>
    )
}

const DEFAULT_CONFIG: S3Config = { aws_access: '', aws_secret: '', aws_bucket: '', aws_region: '' }

function AWSConfigModal({ formData, setFormData, syncState, isEdit, onSave, onCancel }: {
    formData: S3Config
    setFormData: (config: S3Config) => void
    syncState: SyncState
    isEdit: boolean
    onSave: () => void
    onCancel: () => void
}) {
    return (
        <Modal isOpen={true} title="AWS Config" onClose={onCancel}>
            {syncState === SyncState.ERROR && (
                <p className="text-[11px] text-center m-0 text-error">
                    Failed — verify credentials and try again
                </p>
            )}
            <div className="flex flex-col gap-2">
                <input type="text" placeholder="Access Key" value={formData.aws_access} onChange={(e) => setFormData({ ...formData, aws_access: e.target.value })} />
                <input type="password" placeholder={isEdit ? 'Leave blank to keep current' : 'Secret Key'} value={formData.aws_secret} onChange={(e) => setFormData({ ...formData, aws_secret: e.target.value })} />
                <input type="text" placeholder="Bucket" value={formData.aws_bucket} onChange={(e) => setFormData({ ...formData, aws_bucket: e.target.value })} />
                <input type="text" placeholder="Region" value={formData.aws_region} onChange={(e) => setFormData({ ...formData, aws_region: e.target.value })} />
            </div>
            <div className="flex gap-2 justify-end mt-1">
                <button onClick={onCancel}>Cancel</button>
                <button onClick={onSave} disabled={syncState === SyncState.INITIALIZING}>
                    {syncState === SyncState.INITIALIZING ? 'Saving…' : 'Save'}
                </button>
            </div>
        </Modal>
    )
}

export function AWSConfig() {
    const [awsConfig, setAwsConfig] = useState<S3Config | null>(null)
    const [formData, setFormData] = useState<S3Config>(DEFAULT_CONFIG)
    const [modalOpen, setModalOpen] = useState(false)
    const [confirmDisable, setConfirmDisable] = useState(false)
    const syncState = useSyncState()

    const hasCredentials = awsConfig !== null
    const isActive = syncState === SyncState.READY || syncState === SyncState.SYNCING
    const isBusy = syncState === SyncState.SYNCING || syncState === SyncState.INITIALIZING
    const DOT_COLOR: Record<SyncState, string> = {
        [SyncState.READY]:         'var(--color-success)',
        [SyncState.SYNCING]:       'var(--color-warning)',
        [SyncState.INITIALIZING]:  'var(--color-warning)',
        [SyncState.ERROR]:         'var(--color-error)',
        [SyncState.OFFLINE]:       'var(--color-accent)',
        [SyncState.DISABLED]:      'var(--color-accent)',
        [SyncState.UNINITIALIZED]: 'var(--color-accent)',
    }
    const dotColor = DOT_COLOR[syncState]

    useEffect(() => {
        const getConfig = async () => {
            const config = await window.cloudSync.getConfig()
            if (config) {
                setAwsConfig(config)
                setFormData(config)
            }
        }
        getConfig()
    }, [])

    const handleToggleAWS = async () => {
        if (!hasCredentials) {
            if (!networkManager.isOnline()) {
                alert('Please connect to the internet to create an AWS config')
                return
            }
            setModalOpen(true)
        } else if (isActive) {
            setConfirmDisable(true)
        } else {
            await window.cloudSync.initS3Client()
        }
    }

    const handleDisableKeep = async () => {
        await window.cloudSync.disableSync()
        setConfirmDisable(false)
    }

    const handleDisableDelete = async () => {
        await window.cloudSync.deleteConfig()
        setAwsConfig(null)
        setConfirmDisable(false)
    }

    const handleSaveAWS = async () => {
        try {
            awsConfig ? await window.cloudSync.updateConfig(formData) : await window.cloudSync.createConfig(formData)
            setAwsConfig(formData)
            setModalOpen(false)
        } catch (_) {
            // syncState transitions to 'error', shown inline
        }
    }

    const handleCancelAWS = () => {
        setFormData(awsConfig ?? DEFAULT_CONFIG)
        setModalOpen(false)
    }

    const handleSyncAWS = async () => {
        const wasDisabled = !isActive
        let succeeded = false
        try {
            if (wasDisabled) await window.cloudSync.initS3Client()
            await window.cloudSync.cloudSyncPipeline()
            succeeded = true
        } catch (_) {
            // syncState transitions to 'error', shown inline
        } finally {
            if (wasDisabled && succeeded) await window.cloudSync.disableSync()
        }
    }

    return (
        <div>
            <p className="section-label">Cloud Sync</p>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-[13px]">AWS</span>
                    <div className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: dotColor }} />
                </div>
                <div className="flex items-center gap-2">
                    {hasCredentials && (
                        <>
                            <button onClick={() => setModalOpen(true)}>Edit</button>
                            <button onClick={handleSyncAWS} disabled={isBusy}>Sync</button>
                        </>
                    )}
                    <div
                        onClick={handleToggleAWS}
                        className="toggle"
                        style={{ background: isActive ? 'var(--color-accent)' : 'rgba(128,128,128,0.4)' }}
                    >
                        <div className="toggle-slider" style={{ left: isActive ? '18px' : '2px' }} />
                    </div>
                </div>
            </div>

            {syncState === SyncState.ERROR && (
                <p className="text-[11px] mt-2 m-0 text-error">
                    Sync error — check connection or credentials
                </p>
            )}

            {confirmDisable && (
                <div className="flex gap-2 justify-end mt-3">
                    <button onClick={() => setConfirmDisable(false)}>Cancel</button>
                    <button onClick={handleDisableKeep}>Disable</button>
                    <button onClick={handleDisableDelete}>Delete credentials</button>
                </div>
            )}

            {modalOpen && (
                <AWSConfigModal
                    formData={formData}
                    setFormData={setFormData}
                    syncState={syncState}
                    isEdit={awsConfig !== null}
                    onSave={handleSaveAWS}
                    onCancel={handleCancelAWS}
                />
            )}
        </div>
    )
}
