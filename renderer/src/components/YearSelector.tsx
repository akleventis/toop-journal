import React, { useState, useEffect } from 'react'

interface YearSelectorProps {
    currentYear: number;
    onYearChange: (year: number) => void;
    minYear?: number;
    maxYear?: number;
}

export default function YearSelector({ 
    currentYear, 
    onYearChange, 
    minYear = 1000, 
    maxYear = 3000 
}: YearSelectorProps) {
    const [displayYear, setDisplayYear] = useState(currentYear)
    const [gridYear, setGridYear] = useState(currentYear)
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        setDisplayYear(currentYear)
        setGridYear(currentYear)
    }, [currentYear])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element
            if (isOpen && !target.closest('.year-selector-button') && !target.closest('.year-selector-dropdown')) {
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

    // Handle year selection
    const handleYearSelect = (newYear: number) => {
        if (newYear >= minYear && newYear <= maxYear) {
            setDisplayYear(newYear)
            setGridYear(newYear)
            onYearChange(newYear)
            setIsOpen(false)
        }
    }

    // Generate year options for grid display
    const generateYearGrid = () => {
        const years: number[] = []
        const currentYearIndex = gridYear - minYear
        const startIndex = Math.max(0, currentYearIndex - 6) // Show 12 years total (3x4 grid)
        const endIndex = Math.min(maxYear - minYear, startIndex + 11)
        
        for (let i = startIndex; i <= endIndex; i++) {
            const year = minYear + i
            years.push(year)
        }
        
        return years
    }

    // Navigate to previous/next set of years (only updates grid, not main state)
    const navigateYears = (direction: 'prev' | 'next') => {
        const newYear = direction === 'prev' 
            ? Math.max(minYear, gridYear - 12)
            : Math.min(maxYear, gridYear + 12)
        setGridYear(newYear)
    }

    const yearGrid = generateYearGrid()

    return (
        <div style={{ textAlign: 'center', marginBottom: '10px', position: 'relative' }}>
            <button 
                className="year-selector-button"
                onClick={() => setIsOpen(!isOpen)}
                style={{ 
                    padding: '5px 10px', 
                    borderRadius: 'var(--border-radius)',
                    cursor: 'pointer'
                }}
            >
                {displayYear} ▼
            </button>
            
            {isOpen && (
                <div className="year-selector-dropdown" style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: 'var(--app-bg)',
                    border: '1px solid var(--third-bg)',
                    borderRadius: 'var(--border-radius)',
                    padding: '10px',
                    zIndex: 1000,
                    marginTop: '5px'
                }}>
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(3, 1fr)', 
                        gap: '5px',
                        width: '200px',
                        marginBottom: '10px'
                    }}>
                        {yearGrid.map(year => (
                            <button
                                key={year}
                                onClick={() => handleYearSelect(year)}
                                style={{
                                    padding: '4px 0',
                                    backgroundColor: year === displayYear ? 'var(--third-bg)' : 'var(--app-bg)',
                                    borderRadius: 'var(--border-radius)',
                                    cursor: 'pointer'
                                }}
                            >
                                {year}
                            </button>
                        ))}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '50px' }}>
                        <button onClick={() => navigateYears('prev')} disabled={gridYear <= minYear} > ← </button>
                        <button onClick={() => navigateYears('next')} disabled={gridYear >= maxYear} > → </button>
                    </div>
                </div>
            )}
        </div>
    )
} 