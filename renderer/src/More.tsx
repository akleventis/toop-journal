import React, { useEffect, useState } from 'react'
import { markdownToHtml } from '../lib/markdown'
import { usePasswordProtection, useSyncState } from '../lib/hooks'
import { S3Config, SyncState } from '../lib/types'
import * as db from '../db/db'
import { useNavigate } from 'react-router-dom'
import Modal from './components/Modal'

export default function More() {
    return (
        <div className="p-[10px] flex items-center flex-col">
            <Password />
            <div className="m-[15px]" />
            <EntryLimit />
            <div className="m-[15px]" />
            <ExportEntries />
            <div className="m-[15px]" />
            <AWSConfig />
            <div className="m-[15px]" />
            <ConflictsNav />
            <div className="m-[15px]" />
            <LogsNav />
        </div>
    )
}

export function LogsNav() {
    const navigate = useNavigate();
    return (
        <div className="w-full max-w-[300px]">
            <h3
                onClick={() => navigate('/logs')}
                className="text-center mb-[10px] cursor-pointer"
            >
                View Logs
            </h3>
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
        <div className="w-full max-w-[300px]">
            <h3
                onClick={() => navigate('/conflicts')}
                className="text-center mb-[10px] cursor-pointer relative flex items-center justify-center gap-[10px]"
            >
                Conflicts
                <span className="bg-[#e74c3c] text-white px-2 py-[2px] rounded-xl text-[10px] font-bold">
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
            return
        }
        const parsed = parseInt(trimmed, 10)
        if (isNaN(parsed) || parsed <= 0) {
            alert('Please enter a valid number')
            return
        }
        localStorage.setItem('entryLimit', trimmed)
    }

    return (
        <div>
            <h3 className="text-center mb-[10px]">Initial Entry Load Limit</h3>
            <div className="flex gap-[10px] items-center justify-center">
                <input
                    type="number"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="All entries"
                    className="w-[120px] text-[12px]"
                />
                <button onClick={handleSave} className="text-[12px]">Save</button>
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
            <h3 className="text-center mb-[10px]">Export</h3>
            <div className="flex justify-center items-center max-w-[450px]">
                <div className="w-[130px]">
                    <label>Start</label>
                    <input
                        className="text-[12px] h-[30px] mt-1"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                </div>
                <div className="w-[130px]">
                    <label>End</label>
                    <input
                        className="text-[12px] h-[30px] mt-1"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                </div>
                <div className="w-[130px]">
                    <label>Format</label>
                    <select className="text-[12px] h-[30px] mt-1" value={format} onChange={(e) => setFormat(e.target.value)}>
                        <option value="html">HTML</option>
                        <option value="json">JSON</option>
                        <option value="csv">CSV</option>
                        <option value="txt">TXT</option>
                        <option value="encoded_html">Encoded HTML</option>
                    </select>
                </div>
                <div className="flex flex-col">
                    <label>Export</label>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="text-[12px] h-[30px] mt-1 pt-[7px]"
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
            <h3 className="text-center mb-[10px]">Password Protection</h3>
            <div className="flex items-center justify-center gap-[10px]">
                <span>Enabled: </span>
                <div
                    onClick={handleTogglePassword}
                    className="toggle"
                    style={{ background: passwordProtected ? 'var(--color-third-bg)' : 'grey' }}
                >
                    <div
                        className="toggle-slider"
                        style={{ left: passwordProtected ? '17px' : '2px' }}
                    />
                </div>
            </div>

            <Modal isOpen={showPasswordInput} title="Password Protection" onClose={handleCancel}>
                <div className="text-center">
                    <input
                        type="text"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={passwordProtected ? 'Enter current password' : 'Enter new password'}
                        autoFocus
                    />
                    <br />
                    <div className="mt-[10px] flex gap-[10px] justify-center">
                        <button onClick={handlePasswordSubmit}>
                            {passwordProtected ? 'Disable' : 'Enable'}
                        </button>
                        <button onClick={handleCancel}>Cancel</button>
                    </div>
                </div>
            </Modal>
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
    return (
        <Modal isOpen={true} title="AWS Config" onClose={onCancel}>
            {syncState === SyncState.ERROR && (
                <p className="text-[#e74c3c] text-[11px] text-center m-0">
                    Failed — verify credentials and try again
                </p>
            )}
            <input className="text-[10px]" type="text" placeholder="Access Key" value={formData.aws_access} onChange={(e) => setFormData({ ...formData, aws_access: e.target.value })} />
            <input className="text-[10px]" type="text" placeholder="Secret Key" value={formData.aws_secret} onChange={(e) => setFormData({ ...formData, aws_secret: e.target.value })} />
            <input className="text-[10px]" type="text" placeholder="Bucket" value={formData.aws_bucket} onChange={(e) => setFormData({ ...formData, aws_bucket: e.target.value })} />
            <input className="text-[10px]" type="text" placeholder="Region" value={formData.aws_region} onChange={(e) => setFormData({ ...formData, aws_region: e.target.value })} />
            <button onClick={onSave} disabled={syncState === SyncState.INITIALIZING}>Save</button>
            <button onClick={onCancel}>Cancel</button>
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
                await window.cloudSync.initS3Client()
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
            <h3 className="text-center mb-[10px] flex items-center justify-center gap-2">
                AWS Cloud Sync
                <span className="w-[5px] h-[5px] rounded-full inline-block" style={{ backgroundColor: dotColor }} />
            </h3>
            {syncState === SyncState.ERROR && (
                <p className="text-[#e74c3c] text-center text-[11px] m-0 mb-2">
                    Sync error — check your connection or credentials
                </p>
            )}
            <div className="flex items-center justify-center gap-[10px]">
                <span>Enabled: </span>
                <div onClick={handleToggleAWS} className="toggle" style={{ background: isActive ? 'var(--color-third-bg)' : 'grey' }}>
                    <div className="toggle-slider" style={{ left: isActive ? '17px' : '2px' }} />
                </div>
                {hasCredentials && (
                    <div className="flex gap-[5px]">
                        <button className="text-[12px]" onClick={() => setModalOpen(true)}>Edit</button>
                        <button className="text-[12px]" onClick={handleSyncAWS} disabled={isBusy}>Sync</button>
                    </div>
                )}
            </div>
            {confirmDisable && (
                <div className="flex gap-[6px] justify-center mt-2">
                    <button className="text-[11px]" onClick={handleDisableKeep}>Disable</button>
                    <button className="text-[11px]" onClick={handleDisableDelete}>Delete credentials</button>
                    <button className="text-[11px]" onClick={() => setConfirmDisable(false)}>Cancel</button>
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
