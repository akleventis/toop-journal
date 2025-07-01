import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Entry } from '../lib/types'
import { journalDateToCalendarFormat, createCalendarDate } from '../lib/utils'
import YearSelector from './components/YearSelector'

interface CalendarProps {
    entries: Entry[];
    loadEntries: () => void;
}

export default function Calendar({ entries, loadEntries }: CalendarProps) {
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
    const navigate = useNavigate()

    // initial mount, reloads 
    useEffect(() => {
        if (entries.length > 0) return
        loadEntries()
    }, [])

    // create a map of dates that have entries
    const entriesByDate = entries.reduce((acc, entry) => {
        const calendarDate = journalDateToCalendarFormat(entry.date)
        acc[calendarDate] = entry
        return acc
    }, {} as Record<string, Entry>)

    // get days in month
    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate()
    }

    // get first day of month (0 = Sunday, 1 = Monday, etc.)
    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month, 1).getDay()
    }

    // handle date click
    const handleDateClick = (date: string) => {
        const entry = entriesByDate[date]
        if (entry) {
            navigate(`/edit?id=${entry.id}`)
        } else {
            const confirmed = window.confirm(`Create new entry for ${date}?`);
            if (confirmed) {
                navigate(`/new?date=${date}`)
            }
        }
    }

    // generate calendar for a month
    const generateMonthCalendar = (year: number, month: number) => {
        const daysInMonth = getDaysInMonth(year, month)
        const firstDay = getFirstDayOfMonth(year, month)
        const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long' })

        const days: React.JSX.Element[] = []

        // add empty cells for days before the first day of the month
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`}></div>)
        }

        // add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = createCalendarDate(year, month, day)
            const hasEntry = entriesByDate[date]

            days.push(
                <div
                    key={day}
                    onClick={() => handleDateClick(date)}
                    style={{
                        backgroundColor: hasEntry ? 'var(--third-bg)' : 'transparent'
                    }}
                    className="calendar-day"
                >
                    {day}
                </div>
            )
        }

        return (
            <div key={month} style={{ margin: '3px', display: 'inline-block' }}>
                <h3 style={{ textAlign: 'center', margin: '0 0 5px 0', fontSize: '14px' }}>{monthName}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 20px)', gap: '3px' }} className="calendar-grid">
                    <div className="calendar-header">S</div>
                    <div className="calendar-header">M</div>
                    <div className="calendar-header">T</div>
                    <div className="calendar-header">W</div>
                    <div className="calendar-header">T</div>
                    <div className="calendar-header">F</div>
                    <div className="calendar-header">S</div>
                    {days}
                </div>
            </div>
        )
    }

    return (
        <div style={{ padding: '10px' }}>
            <YearSelector
                currentYear={currentYear}
                onYearChange={setCurrentYear}
            />

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-evenly', gap: '10px' }}>
                {Array.from({ length: 12 }, (_, month) => generateMonthCalendar(currentYear, month))}
            </div>
        </div>
    )
}