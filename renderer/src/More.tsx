import React, { useState } from 'react'
import * as idb from '../db/idb'
import { hashPassword, decodeHtmlEntities } from '../lib/utils'
import { usePasswordProtection } from '../lib/hooks'

export default function More() {
    return (
        <div style={{ padding: '10px', display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
            <Password />
            <div style={{ margin: '15px' }} />
            <ExportEntries />
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
                <div style={{ width: "130px"}}>
                    <label>Format</label>
                    <select style={{ fontSize: '12px', height: '30px', marginTop: '4px' }} value={format} onChange={(e) => setFormat(e.target.value)}>
                        <option value="html">HTML</option>
                        <option value="json">JSON</option>
                        <option value="csv">CSV</option>
                        <option value="txt">TXT</option>
                        <option value="encoded_html">Encoded HTML</option>
                    </select>
                </div>
                <div style={{display: 'flex', flexDirection: 'column'}}>
                    <label>Export</label>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        style={{ fontSize: '12px', height: '30px', marginTop: '4px' }}
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
                    className="password-toggle"
                    style={{ background: passwordProtected ? 'var(--third-bg)' : 'grey' }}
                >
                    <div
                        className="password-toggle-slider"
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
