import React, { useState, useEffect, useRef } from 'react';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

const CORNER_STYLE: Record<Corner, React.CSSProperties> = {
    tl: { left: -6, top: -6,    cursor: 'nwse-resize' },
    tr: { right: -6, top: -6,   cursor: 'nesw-resize' },
    bl: { left: -6, bottom: -6, cursor: 'nesw-resize' },
    br: { right: -6, bottom: -6, cursor: 'nwse-resize' },
};

interface Rect { left: number; top: number; width: number; height: number; }

function rectOf(img: HTMLImageElement, container: HTMLElement): Rect {
    const c = container.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
}

interface Props {
    img: HTMLImageElement;
    container: HTMLElement;
    onResize: (html: string) => void;
}

const ImageResizeOverlay: React.FC<Props> = ({ img, container, onResize }) => {
    const [rect, setRect] = useState<Rect>(() => rectOf(img, container));
    const divRef = useRef<HTMLDivElement>(null);

    // Re-sync when a different image is selected
    useEffect(() => {
        setRect(rectOf(img, container));
    }, [img, container]);

    // Track scroll in any parent so handles stay aligned
    useEffect(() => {
        const onScroll = () => {
            if (!divRef.current) return;
            const r = rectOf(img, container);
            divRef.current.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
        };
        window.addEventListener('scroll', onScroll, true);
        return () => window.removeEventListener('scroll', onScroll, true);
    }, [img, container]);

    const startDrag = (e: React.MouseEvent, corner: Corner) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = img.getBoundingClientRect().width;
        const rightSide = corner === 'tr' || corner === 'br';

        const onMove = (ev: MouseEvent) => {
            const delta = rightSide ? ev.clientX - startX : startX - ev.clientX;
            img.setAttribute('width', String(Math.min(1000, Math.max(50, Math.round(startW + delta)))));
            if (divRef.current) {
                const r = rectOf(img, container);
                divRef.current.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border:1.5px solid var(--color-accent);pointer-events:none;z-index:10`;
            }
        };

        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            const ce = container.querySelector('[contenteditable]');
            if (ce) onResize(ce.innerHTML);
            setRect(rectOf(img, container));
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div
            ref={divRef}
            style={{
                position: 'absolute',
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                border: '1.5px solid var(--color-accent)',
                pointerEvents: 'none',
                zIndex: 10,
            }}
        >
            {CORNERS.map(corner => (
                <div
                    key={corner}
                    data-resize-handle="true"
                    onMouseDown={e => startDrag(e, corner)}
                    style={{
                        position: 'absolute',
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: 'white',
                        border: '1px solid rgba(0,0,0,0.35)',
                        pointerEvents: 'auto',
                        ...CORNER_STYLE[corner],
                    }}
                />
            ))}
        </div>
    );
};

export default ImageResizeOverlay;
