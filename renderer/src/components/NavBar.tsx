import React from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'

interface NavBarProps {
  activeTab: string
}

export default function NavBar({ activeTab }: NavBarProps) {
  return (
    <nav className="flex gap-[2px] justify-center text-center py-[10px] px-5">
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
    </nav>
  )
}
