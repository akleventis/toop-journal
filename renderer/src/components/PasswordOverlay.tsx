import React, { useState } from 'react'

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
            const storedHash = await window.sqlite.getPasswordHash()
            const storedSalt = await window.sqlite.getPasswordSalt()

            if (!storedHash || !storedSalt) {
                alert('Password not configured')
                return
            }

            const isValid = await window.security.verifyPassword(password, storedHash, storedSalt)

            if (isValid) {
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
                        onKeyDown={handlePasswordKeyPress}
                        autoFocus
                    />
                </div>
            </div>
        </div>
    )
}