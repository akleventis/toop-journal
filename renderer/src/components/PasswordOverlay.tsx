import React, { useState } from 'react'
import { handleError } from '../../lib/error-handler'

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
            handleError(error, 'Error verifying password')
        }
    }

    const handlePasswordKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handlePasswordSubmit()
        }
    }

    return (
        <div className="h-screen flex items-center justify-center">
            <div className="text-center">
                <p className="text-[15px]">Login</p>
                <div className="mt-[15px]">
                    <input
                        type="password"
                        className="w-[200px] border border-[color:var(--color-third-bg)] rounded bg-[color:var(--color-secondary-bg)]"
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