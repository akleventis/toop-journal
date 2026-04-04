import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { networkManager } from '../../lib/network-manager'

interface NavBarProps {
  activeTab: string
}

export default function NavBar({ activeTab }: NavBarProps) {
  const [online, setOnline] = useState(networkManager.isOnline());

  useEffect(() => {
    return networkManager.subscribe(setOnline);
  }, []);

  return (
    <nav className="relative flex gap-[2px] justify-center text-center py-[10px] px-5">
      <Link
        to="/new"
        className={clsx('w-20 py-[5px] rounded-tl rounded-bl', activeTab === '/new' ? 'bg-[color:var(--color-third-bg)]' : 'bg-[color:var(--color-secondary-bg)]')}
      >
        New
      </Link>
      <Link
        to="/list"
        className={clsx('w-20 py-[5px]', activeTab === '/list' ? 'bg-[color:var(--color-third-bg)]' : 'bg-[color:var(--color-secondary-bg)]')}
      >
        List
      </Link>
      <Link
        to="/calendar"
        className={clsx('w-20 py-[5px]', activeTab === '/calendar' ? 'bg-[color:var(--color-third-bg)]' : 'bg-[color:var(--color-secondary-bg)]')}
      >
        Calendar
      </Link>
      <Link
        to="/more"
        className={clsx('w-20 py-[5px] rounded-tr rounded-br', activeTab === '/more' ? 'bg-[color:var(--color-third-bg)]' : 'bg-[color:var(--color-secondary-bg)]')}
      >
        More
      </Link>
      <div className="absolute right-4 top-1/2 -translate-y-1/2 group flex items-center gap-1">
        <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {online ? 'online' : 'offline'}
        </span>
        <div
          className="w-[6px] h-[6px] rounded-full"
          style={{ backgroundColor: online ? '#2ecc71' : '#e74c3c' }}
        />
      </div>
    </nav>
  )
}
