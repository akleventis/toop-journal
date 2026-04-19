import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { networkManager } from '../../lib/network-manager'

interface NavBarProps {
  activeTab: string
}

const tabs = [
  { path: '/new', label: 'New' },
  { path: '/list', label: 'List' },
  { path: '/calendar', label: 'Calendar' },
  { path: '/more', label: 'More' },
]

export default function NavBar({ activeTab }: NavBarProps) {
  const [online, setOnline] = useState(networkManager.isOnline());

  useEffect(() => {
    return networkManager.subscribe(setOnline);
  }, []);

  return (
    <div className="relative flex justify-center py-2 px-4">
      <nav className="glass-surface flex items-center gap-1 py-1.5 px-1 rounded-sm">
        {tabs.map(tab => (
          <Link
            key={tab.path}
            to={tab.path}
            className={clsx(
              'w-[68px] py-[5px] rounded-sm text-center text-[12px] font-medium transition-all duration-150',
              activeTab === tab.path
                ? 'bg-[color:var(--color-third-bg)]'
                : 'opacity-50'
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="absolute right-6 top-1/2 -translate-y-1/2 group flex items-center gap-1">
        <span
          className="text-[9px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ color: 'var(--text-muted)' }}
        >
          {online ? 'online' : 'offline'}
        </span>
        <div
          className="w-[5px] h-[5px] rounded-full"
          style={{ backgroundColor: online ? '#2ecc71' : '#e74c3c' }}
        />
      </div>
    </div>
  )
}
