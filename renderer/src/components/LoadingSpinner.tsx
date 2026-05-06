import React from 'react';

export default function LoadingSpinner({ size = 24 }: { size?: number }) {
    return (
        <div
            className="rounded-full border-2 border-raised border-t-transparent animate-spin"
            style={{ width: size, height: size }}
        />
    );
}
