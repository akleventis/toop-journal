import React, { useState } from 'react'
import * as idb from '../../db/idb'
import { hashPassword } from '../../lib/utils'

interface PasswordOverlayProps {
    onPasswordVerified: () => void
}

export default function PasswordOverlay({ onPasswordVerified }: PasswordOverlayProps) {
    const [password, setPassword] = useState('')

    const handlePasswordSubmit = async () => {
        if (!password.trim()) {
            alert('Please enter a password')
            return
        }

        try {
            const hash = hashPassword(password)
            const storedHash = await idb.idbGetPasswordHash()

            if (hash === storedHash) { 
                setPassword('')
                onPasswordVerified()
            } else {
                alert('Incorrect password')
                setPassword('')
            }
        } catch (error) {
            alert('Error verifying password')
        }
    }

    const handlePasswordKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handlePasswordSubmit()
        }
    }

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '15px'}}>Login</p>
                <div style={{ marginTop: '15px' }}>
                    <input
                        type="password"
                        style={{
                            width: '200px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            background: 'var(--secondary-bg)',
                            color: 'var(--text-color)'
                        }}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyPress={handlePasswordKeyPress}
                        autoFocus
                    />
                </div>
            </div>
        </div>
    )
}