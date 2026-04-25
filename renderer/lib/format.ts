// Formats a byte count as a human-readable string (KB/MB/GB). Returns 'Unknown' for negative values.
export function formatBytes(bytes: number): string {
    if (bytes < 0) return 'Unknown';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

// Formats a Unix timestamp (ms) as a relative time string (e.g. '5m ago', '2h ago'). Returns 'Never' for 0.
export function formatRelativeTime(ts: number): string {
    if (ts === 0) return 'Never';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(ts).toLocaleDateString();
}
