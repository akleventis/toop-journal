import React, { useState, useRef } from 'react'
import { handleError } from '../../lib/error-handler'
import * as db from '../../db/db'

const FAIL_DELAY_MS = 1500;

interface PasswordOverlayProps {
    onPasswordVerified: () => void
}

export default function PasswordOverlay({ onPasswordVerified }: PasswordOverlayProps) {
    const [password, setPassword] = useState('')
    const [locked, setLocked] = useState(false)
    const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handlePasswordSubmit = async () => {
        if (locked || !password.trim()) return

        try {
            const storedHash = await db.getPasswordHash()
            const storedSalt = await db.getPasswordSalt()

            if (!storedHash || !storedSalt) {
                alert('Password not configured')
                return
            }

            const isValid = await window.security.verifyPassword(password, storedHash, storedSalt)

            if (isValid) {
                if (lockTimer.current) clearTimeout(lockTimer.current)
                setPassword('')
                onPasswordVerified()
            } else {
                setPassword('')
                // throttle: enforce a delay between failed attempts
                setLocked(true)
                lockTimer.current = setTimeout(() => setLocked(false), FAIL_DELAY_MS)
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
                        className="w-[200px] border border-raised rounded bg-surface"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={handlePasswordKeyPress}
                        autoFocus
                        disabled={locked}
                    />
                </div>
                {locked && <p className="text-[12px] text-muted mt-[8px]">Incorrect password</p>}
            </div>
        </div>
    )
}
