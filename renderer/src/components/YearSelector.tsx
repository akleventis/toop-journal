import React, { useState, useEffect, useRef } from 'react'
import { clsx } from 'clsx'

interface YearSelectorProps {
    currentYear: number;
    onYearChange: (year: number) => void;
    minYear?: number;
    maxYear?: number;
    yearsWithEntries?: Set<number>;
}

export default function YearSelector({
    currentYear,
    onYearChange,
    minYear = 1000,
    maxYear = 3000,
    yearsWithEntries,
}: YearSelectorProps) {
    const [displayYear, setDisplayYear] = useState(currentYear)
    const [gridYear, setGridYear] = useState(currentYear)
    const [isOpen, setIsOpen] = useState(false)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setDisplayYear(currentYear)
        setGridYear(currentYear)
    }, [currentYear])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen &&
                !buttonRef.current?.contains(event.target as Node) &&
                !dropdownRef.current?.contains(event.target as Node)
            ) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    const handleYearSelect = (newYear: number) => {
        if (newYear >= minYear && newYear <= maxYear) {
            setDisplayYear(newYear)
            setGridYear(newYear)
            onYearChange(newYear)
            setIsOpen(false)
        }
    }

    const generateYearGrid = () => {
        const years: number[] = []
        const currentYearIndex = gridYear - minYear
        const startIndex = Math.max(0, currentYearIndex - 6)
        const endIndex = Math.min(maxYear - minYear, startIndex + 11)

        for (let i = startIndex; i <= endIndex; i++) {
            const year = minYear + i
            years.push(year)
        }

        return years
    }

    const navigateYears = (direction: 'prev' | 'next') => {
        const newYear = direction === 'prev'
            ? Math.max(minYear, gridYear - 12)
            : Math.min(maxYear, gridYear + 12)
        setGridYear(newYear)
    }

    const yearGrid = generateYearGrid()

    return (
        <div className="text-center mb-[10px] relative">
            <button
                ref={buttonRef}
                className="px-[10px] py-[5px] rounded cursor-pointer"
                onClick={() => setIsOpen(!isOpen)}
            >
                {displayYear} ▼
            </button>

            {isOpen && (
                <div ref={dropdownRef} className="absolute top-full left-1/2 -translate-x-1/2 bg-app border border-raised rounded p-[10px] z-[1000] mt-[5px]">
                    <div className="grid grid-cols-3 gap-[5px] w-[200px] mb-[10px]">
                        {yearGrid.map(year => (
                            <button
                                key={year}
                                onClick={() => handleYearSelect(year)}
                                className={clsx(
                                'py-1 rounded cursor-pointer',
                                year === displayYear ? '!bg-raised' : '!bg-app',
                                yearsWithEntries?.has(year) ? '!font-bold' : '!font-normal'
                            )}
                            >
                                {year}
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-center gap-[50px]">
                        <button onClick={() => navigateYears('prev')} disabled={gridYear <= minYear}> ← </button>
                        <button onClick={() => navigateYears('next')} disabled={gridYear >= maxYear}> → </button>
                    </div>
                </div>
            )}
        </div>
    )
}
