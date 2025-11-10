import React, { useEffect, useState } from 'react'
import * as idb from '../db/idb'
import { hashPassword, decodeHtmlEntities } from '../lib/utils'
import { usePasswordProtection } from '../lib/hooks'
import { S3Config } from '../lib/types'

export default function More() {
    return (
        <div style={{ padding: '10px', display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
            <Password />
            <div style={{ margin: '15px' }} />
            <ExportEntries />
            <div style={{ margin: '15px' }} />
            <AWSConfig />
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
            const entries = await idb.idbGetEntriesBetweenTimestamps(startTs, endTs)

            if (entries.length === 0) {
                alert('No entries found in selected date range')
                return
            }

            let content = ''
            let filename = `journal_export_${startDate}_${endDate}`

            switch (format) {
                case 'html':
                    content = entries.map(entry =>
                        `<div><h3>${entry.date}</h3><p>${decodeHtmlEntities(entry.content)}</p></div><hr>`
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
                        `${entry.date}\n${decodeHtmlEntities(entry.content)}\n${entry.location || ''}\n---\n`
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
            await idb.idbSetPasswordHash('')
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
                const hash = hashPassword(password)
                await idb.idbSetPasswordHash(hash)
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
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

export function AWSConfig() {
    const defaultConfig: S3Config = { aws_access: '', aws_secret: '', aws_bucket: '', aws_region: '' }
    const [awsConfig, setAwsConfig] = useState<S3Config | null>(null)
    const [formData, setFormData] = useState<S3Config>(defaultConfig)
    const [isEnabled, setIsEnabled] = useState(false)
    const [modalOpen, setModalOpen] = useState(false)
    const [syncStatus, setSyncStatus] = useState<string>('Sync')

    useEffect(() => {
        const getConfig = async () => {
            const config = await window.cloudSync.getConfig()
            if (config) {
                setAwsConfig(config)
                setFormData(config)
                setIsEnabled(true)
            }
        }
        getConfig()
    }, [])

    // todo: test w/out network connection
    const handleToggleAWS = async () => {
        if (!isEnabled) {
            if (!window.network.isOnline()) {
                alert('Please connect to the internet to create an AWS config')
                return
            }
            setModalOpen(true)
        }
        if (isEnabled) {
            const confirmed = window.confirm('are you sure you want to disable AWS config?')
            if (confirmed) {
                await window.cloudSync.deleteConfig()
                setAwsConfig(null)
                setFormData({ aws_access: '', aws_secret: '', aws_bucket: '', aws_region: '' })
                setIsEnabled(false)
            }
        }
    }

    const handleSaveAWS = async () => {
        try {
            awsConfig ? await window.cloudSync.updateConfig(formData) : await window.cloudSync.createConfig(formData)
            setAwsConfig(formData)
            setIsEnabled(true)
        } catch (error) {
            setFormData(awsConfig ?? defaultConfig)
            alert('AWS config failed, please verify credentials')
            return
        }
        alert('AWS config verified')
        setModalOpen(false)
    }

    const handleCancelAWS = () => {
        setFormData(awsConfig ?? defaultConfig)
        setModalOpen(false)
    }

    // todo: count local / s3 puts / gets / deletes
    const handleSyncAWS = async () => {
        setSyncStatus('Syncing...')
        try {
            const success = await window.cloudSync.cloudSyncPipeline()
            success ? setSyncStatus('Success') : setSyncStatus('Sync failed')
        } catch (error) {
            alert('Sync failed')
        } finally {
            setSyncStatus('Sync')
        }
    }

    return (
        <div>
            <h3 style={{ textAlign: 'center', marginBottom: '10px' }}>AWS Cloud Sync</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span>Enabled: </span>
                <div
                    onClick={handleToggleAWS}
                    className="toggle"
                    style={{ background: isEnabled ? 'var(--third-bg)' : 'grey' }}
                >
                    <div
                        className="toggle-slider"
                        style={{ left: isEnabled ? '17px' : '2px' }}
                    />
                </div>
            {isEnabled && (
                <div style={{ display: 'flex', gap: '5px' }}>
                    <button style={{ fontSize: '12px' }} onClick={() => setModalOpen(true)}>Edit</button>
                    <button style={{ fontSize: '12px' }} onClick={() => handleSyncAWS()}>{syncStatus ? syncStatus : 'Sync'}</button>
                </div>
            )}
            </div>
            {modalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(28, 28, 28, 0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ padding: '20px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '250px' }}>
                        <p style={{ textAlign: 'center' }}>AWS Config</p>
                        <input type="text" style={{ fontSize: '10px' }} placeholder="Access Key" value={formData?.aws_access} onChange={(e) => setFormData({ ...formData, aws_access: e.target.value })} />
                        <input type="text" style={{ fontSize: '10px' }} placeholder="Secret Key" value={formData?.aws_secret} onChange={(e) => setFormData({ ...formData, aws_secret: e.target.value })} />
                        <input type="text" style={{ fontSize: '10px' }} placeholder="Bucket" value={formData?.aws_bucket} onChange={(e) => setFormData({ ...formData, aws_bucket: e.target.value })} />
                        <input type="text" style={{ fontSize: '10px' }} placeholder="Region" value={formData?.aws_region} onChange={(e) => setFormData({ ...formData, aws_region: e.target.value })} />
                        <button onClick={handleSaveAWS}>Save</button>
                        <button onClick={handleCancelAWS}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    )
}