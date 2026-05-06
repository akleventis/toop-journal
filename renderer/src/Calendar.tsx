import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import type { DecodedEntry } from '../../shared/types'
import { journalToCalendar, createCalendarDate } from '../lib/dates'
import YearSelector from './components/YearSelector'

interface CalendarProps {
    entries: DecodedEntry[];
    loadEntries: () => void;
    selectedYear: number;
    setSelectedYear: (year: number) => void;
}

export default function Calendar({ entries, loadEntries, selectedYear, setSelectedYear }: CalendarProps) {
    const navigate = useNavigate()

    useEffect(() => {
        if (entries.length > 0) return
        loadEntries()
    }, [])

    const entriesByDate = entries.reduce((acc, entry) => {
        const calendarDate = journalToCalendar(entry.date)
        acc[calendarDate] = entry
        return acc
    }, {} as Record<string, DecodedEntry>)

    const yearsWithEntries = new Set(entries.map(e => parseInt(journalToCalendar(e.date).slice(0, 4), 10)))

    const getDaysInMonth = (year: number, month: number) => {
        return new Date(year, month + 1, 0).getDate()
    }

    const getFirstDayOfMonth = (year: number, month: number) => {
        return new Date(year, month, 1).getDay()
    }

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

    const generateMonthCalendar = (year: number, month: number) => {
        const daysInMonth = getDaysInMonth(year, month)
        const firstDay = getFirstDayOfMonth(year, month)
        const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long' })

        const days: React.JSX.Element[] = []

        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`}></div>)
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = createCalendarDate(year, month, day)
            const hasEntry = entriesByDate[date]

            days.push(
                <div
                    key={day}
                    onClick={() => handleDateClick(date)}
                    className={clsx(
                        'rounded text-center w-[28px] h-[28px] cursor-pointer text-[12px] flex items-center justify-center',
                        hasEntry ? 'bg-[color:var(--color-third-bg)]' : 'bg-transparent'
                    )}
                >
                    {day}
                </div>
            )
        }

        return (
            <div key={month} className="m-[4px] inline-block">
                <h3 className="text-center mb-[6px] mt-0 text-[15px]">{monthName}</h3>
                <div className="grid gap-[4px]" style={{ gridTemplateColumns: 'repeat(7, 28px)' }}>
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                        <div key={i} className="text-center font-bold text-[11px] h-[28px] flex items-center justify-center">{d}</div>
                    ))}
                    {days}
                </div>
            </div>
        )
    }

    return (
        <div className="p-[10px]">
            <YearSelector
                currentYear={selectedYear}
                onYearChange={setSelectedYear}
                yearsWithEntries={yearsWithEntries}
            />
            <div className="flex flex-wrap justify-evenly gap-[10px]">
                {Array.from({ length: 12 }, (_, month) => generateMonthCalendar(selectedYear, month))}
            </div>
        </div>
    )
}
