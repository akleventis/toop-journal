import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import type { DecodedEntry } from '../lib/types'
import { journalToCalendar, createCalendarDate } from '../lib/utils'
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
                        'rounded text-center w-5 h-5 cursor-pointer text-[10px] flex items-center justify-center',
                        'md:w-[25px] md:h-[25px] md:text-[12px] md:p-[3px]',
                        'lg:w-[30px] lg:h-[30px] lg:text-[14px] lg:p-1',
                        hasEntry ? 'bg-[color:var(--color-third-bg)]' : 'bg-transparent'
                    )}
                >
                    {day}
                </div>
            )
        }

        return (
            <div key={month} className="m-[3px] inline-block">
                <h3 className="text-center mb-[5px] mt-0 text-[14px]">{monthName}</h3>
                <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(7, 20px)' }}>
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                        <div key={i} className="p-[2px] text-center font-bold text-[10px] md:text-[12px] md:p-[3px] lg:text-[14px] lg:p-1">{d}</div>
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
            />
            <div className="flex flex-wrap justify-evenly gap-[10px]">
                {Array.from({ length: 12 }, (_, month) => generateMonthCalendar(selectedYear, month))}
            </div>
        </div>
    )
}
