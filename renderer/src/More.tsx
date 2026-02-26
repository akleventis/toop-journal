import React, { useEffect, useState } from 'react'
import { markdownToHtml } from '../lib/utils'
import { usePasswordProtection, useSyncState } from '../lib/hooks'
import { S3Config, SyncState } from '../lib/types'
import * as db from '../db/db'
import { useNavigate } from 'react-router-dom'

export default function More() {
    return (
        <div style={{ padding: '10px', display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
            <Password />
            <div style={{ margin: '15px' }} />
            <EntryLimit />
            <div style={{ margin: '15px' }} />
            <ExportEntries />
            <div style={{ margin: '15px' }} />
            <AWSConfig />
            <div style={{ margin: '15px' }} />
            <ConflictsNav />
        </div>

    )
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
        <div style={{ width: '100%', maxWidth: '300px' }}>
            <h3
                onClick={() => navigate('/conflicts')}
                style={{
                    textAlign: 'center',
                    marginBottom: '10px',
                    cursor: 'pointer',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                }}
            >
                Conflicts
                <span style={{
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                }}>
                    {conflictCount}
                </span>
            </h3>
        </div>
    );
}

export function EntryLimit() {
    const [limit, setLimit] = useState<string>('')

    useEffect(() => {
        const stored = localStorage.getItem('entryLimit') || ''
        setLimit(stored)
    }, [])

    const handleSave = () => {
        const trimmed = limit.trim()

        if (!trimmed) {
            localStorage.removeItem('entryLimit')
            window.location.reload()
            return
        }

        const parsed = parseInt(trimmed, 10)
        if (isNaN(parsed) || parsed <= 0) {
            alert('Please enter a valid number')
            return
        }

        localStorage.setItem('entryLimit', trimmed)
        window.location.reload() // todo: does not work well w/ password protection
    }

    return (
        <div>
            <h3 style={{ textAlign: 'center', marginBottom: '10px' }}>Initial Entry Load Limit</h3>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
                <input
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="All entries"
                    style={{ width: '120px', fontSize: '12px' }}
                />
                <button onClick={handleSave} style={{ fontSize: '12px' }}>Save</button>
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

            let content = ''
            let filename = `journal_export_${startDate}_${endDate}`

            switch (format) {
                case 'html':
                    content = entries.map(entry =>
                        `<div><h3>${entry.date}</h3>${markdownToHtml(entry.content)}</div><hr>`
                    ).join('')
                    content = `<html><body>${content}</body></html>`
                    filename += '.html'
                    break
                case 'json':
                    content = JSON.stringify(entries, null, 2)
                    filename += '.json'
                    break
                case 'csv':
                    content = 'Date,Location,Content\n'
                    content += entries.map(entry =>
                        `"${entry.date}","${entry.location || ""},"${entry.content.replace(/"/g, '""')}""`
                    ).join('\n')
                    filename += '.csv'
                    break
                case 'txt':
                    content = entries.map(entry =>
                        `${entry.date}\n${entry.content}\n${entry.location || ''}\n---\n`
                    ).join('\n')
                    filename += '.txt'
                    break
                case 'encoded_html':
                    const encodedEntries = entries.map(entry => ({
                        id: entry.id,
                        date: entry.date,
                        location: entry.location || '',
                        content: entry.content,
                        timestamp: entry.timestamp
                    }))
                    content = JSON.stringify(encodedEntries, null, 2)
                    filename += '.json'
                    break
            }

            const blob = new Blob([content], { type: 'text/plain' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            a.click()
            URL.revokeObjectURL(url)
        } catch (error) {
            alert('Export failed: ' + error)
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div>
            <h3 style={{ textAlign: 'center', marginBottom: '10px' }}>Export</h3>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: "center", maxWidth: '450px' }}>
                <div style={{ width: "130px" }}>
                    <label>Start</label>
                    <input
                        style={{ fontSize: '12px', height: '30px', marginTop: '4px' }}
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                </div>
                <div style={{ width: "130px" }}>
                    <label>End</label>
                    <input
                        style={{ fontSize: '12px', height: '30px', marginTop: '4px' }}
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>
                <div style={{ width: "130px" }}>
                    <label>Format</label>
                    <select style={{ fontSize: '12px', height: '30px', marginTop: '4px' }} value={format} onChange={(e) => setFormat(e.target.value)}>
                        <option value="html">HTML</option>
                        <option value="json">JSON</option>
                        <option value="csv">CSV</option>
                        <option value="txt">TXT</option>
                        <option value="encoded_html">Encoded HTML</option>
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label>Export</label>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        style={{ fontSize: '12px', height: '30px', marginTop: '4px', paddingTop: '7px' }}
                    >{"↩︎"}
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
        // password is protected already, just clear out password, no need to input
        if (passwordProtected) {
            await window.sqlite.clearPasswordCredentials()
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
                await window.sqlite.setPasswordHash(hash)
                await window.sqlite.setPasswordSalt(salt)
                setShowPasswordInput(false)
                setPassword('')
                // update password protection state without reloading
                await updatePasswordProtection()
            } catch (error) {
                alert('Error enabling password')
            }
        }
    }

    const handleCancel = () => {
        setShowPasswordInput(false)
        setPassword('')
    }

    return (
        <div>
            <h3 style={{ textAlign: 'center', marginBottom: '10px' }}>Password Protection</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span>Enabled: </span>
                <div
                    onClick={handleTogglePassword}
                    className="toggle"
                    style={{ background: passwordProtected ? 'var(--third-bg)' : 'grey' }}
                >
                    <div
                        className="toggle-slider"
                        style={{ left: passwordProtected ? '17px' : '2px' }}
                    />
                </div>
            </div>

            {showPasswordInput && (
                <div style={{ position: 'fixed', zIndex: 1, top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.86)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                        <input
                            type="text"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={passwordProtected ? 'Enter current password' : 'Enter new password'}
                            autoFocus
                        />
                        <br />
                        <div style={{ marginTop: '10px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button onClick={handlePasswordSubmit}>
                                {passwordProtected ? 'Disable' : 'Enable'}
                            </button>
                            <button onClick={handleCancel}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

const DEFAULT_CONFIG: S3Config = { aws_access: '', aws_secret: '', aws_bucket: '', aws_region: '' }

function AWSConfigModal({ formData, setFormData, syncState, onSave, onCancel }: {
    formData: S3Config
    setFormData: (config: S3Config) => void
    syncState: SyncState
    onSave: () => void
    onCancel: () => void
}) {
    const inputStyle = { fontSize: '10px' }
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(28, 28, 28, 0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ padding: '20px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '250px' }}>
                <p style={{ textAlign: 'center' }}>AWS Config</p>
                {syncState === SyncState.ERROR && (
                    <p style={{ color: '#e74c3c', fontSize: '11px', textAlign: 'center', margin: 0 }}>
                        Failed — verify credentials and try again
                    </p>
                )}
                <input style={inputStyle} type="text" placeholder="Access Key" value={formData.aws_access} onChange={(e) => setFormData({ ...formData, aws_access: e.target.value })} />
                <input style={inputStyle} type="text" placeholder="Secret Key" value={formData.aws_secret} onChange={(e) => setFormData({ ...formData, aws_secret: e.target.value })} />
                <input style={inputStyle} type="text" placeholder="Bucket" value={formData.aws_bucket} onChange={(e) => setFormData({ ...formData, aws_bucket: e.target.value })} />
                <input style={inputStyle} type="text" placeholder="Region" value={formData.aws_region} onChange={(e) => setFormData({ ...formData, aws_region: e.target.value })} />
                <button onClick={onSave} disabled={syncState === SyncState.INITIALIZING}>Save</button>
                <button onClick={onCancel}>Cancel</button>
            </div>
        </div>
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
    const dotColor =
        syncState === SyncState.READY ? '#2ecc71' :
        syncState === SyncState.SYNCING || syncState === SyncState.INITIALIZING ? '#f1c40f' :
        syncState === SyncState.ERROR ? '#e74c3c' :
        'grey'

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

    // todo: test w/out network connection
    const handleToggleAWS = async () => {
        if (!hasCredentials) {
            if (!window.network.isOnline()) {
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
            if (wasDisabled) {
                await window.cloudSync.initS3Client() // already runs cloudSyncPipeline internally
            } else {
                await window.cloudSync.cloudSyncPipeline()
            }
            succeeded = true
        } catch (_) {
            // syncState transitions to 'error', shown inline
        } finally {
            if (wasDisabled && succeeded) await window.cloudSync.disableSync()
        }
    }

    return (
        <div>
            <h3 style={{ textAlign: 'center', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                AWS Cloud Sync
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', display: 'inline-block', backgroundColor: dotColor }} />
            </h3>
            {syncState === SyncState.ERROR && (
                <p style={{ color: '#e74c3c', textAlign: 'center', fontSize: '11px', margin: '0 0 8px' }}>
                    Sync error — check your connection or credentials
                </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span>Enabled: </span>
                <div onClick={handleToggleAWS} className="toggle" style={{ background: isActive ? 'var(--third-bg)' : 'grey' }}>
                    <div className="toggle-slider" style={{ left: isActive ? '17px' : '2px' }} />
                </div>
                {hasCredentials && (
                    <div style={{ display: 'flex', gap: '5px' }}>
                        <button style={{ fontSize: '12px' }} onClick={() => setModalOpen(true)}>Edit</button>
                        <button style={{ fontSize: '12px' }} onClick={handleSyncAWS} disabled={isBusy}>Sync</button>
                    </div>
                )}
            </div>
            {confirmDisable && (
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '8px' }}>
                    <button style={{ fontSize: '11px' }} onClick={handleDisableKeep}>Disable</button>
                    <button style={{ fontSize: '11px' }} onClick={handleDisableDelete}>Delete credentials</button>
                    <button style={{ fontSize: '11px' }} onClick={() => setConfirmDisable(false)}>Cancel</button>
                </div>
            )}
            {modalOpen && (
                <AWSConfigModal
                    formData={formData}
                    setFormData={setFormData}
                    syncState={syncState}
                    onSave={handleSaveAWS}
                    onCancel={handleCancelAWS}
                />
            )}
        </div>
    )
}