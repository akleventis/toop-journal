import React from 'react'
import { Link } from 'react-router-dom'

interface NavBarProps {
  activeTab: string
}

export default function NavBar({ activeTab }: NavBarProps) {
  return (
    <nav style={{
      display: 'flex',
      columnGap: '2px',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 'var(--p-out-vertical) var(--p-out-horizontal)',
    }}>
      <Link
        to="/new"
        className='nav-link'
        style={{
          background: activeTab === '/new' ? 'var(--third-bg)' : 'var(--secondary-bg)',
          borderTopLeftRadius: 'var(--border-radius)',
          borderBottomLeftRadius: 'var(--border-radius)',
        }}
      >
        New
      </Link>
      <Link
        to="/list"
        className='nav-link'
        style={{
          background: activeTab === '/list' ? 'var(--third-bg)' : 'var(--secondary-bg)',
        }}
      >
        List
      </Link>
      <Link
        to="/calendar"
        className='nav-link'
        style={{
          background: activeTab === '/calendar' ? 'var(--third-bg)' : 'var(--secondary-bg)',
        }}
      >
        Calendar
      </Link>
      <Link
        to="/more"
        className='nav-link'
        style={{
          background: activeTab === '/more' ? 'var(--third-bg)' : 'var(--secondary-bg)',
          borderTopRightRadius: 'var(--border-radius)',
          borderBottomRightRadius: 'var(--border-radius)',
        }}
      >
        More
      </Link>
    </nav>
  )
} 