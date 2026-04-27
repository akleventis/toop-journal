import React, { useState, useEffect, useRef } from 'react';
import Editor, { Toolbar } from 'react-simple-wysiwyg';
import type { ContentEditableEvent } from 'react-simple-wysiwyg';
import { useNavigate } from 'react-router-dom';
import TextEditNav from './TextEditNav';
import ImageResizeOverlay from './ImageResizeOverlay';
import type { Entry } from '../../../shared/types';
import { deleteEntry } from '../../lib/entries';
import { NavDirection } from '../../lib/constants';

const DEFAULT_IMAGE_WIDTH = 200;

interface TextEditProps {
    displayNav: boolean;
    editable: boolean;
    entry: Entry | null;
    onNavigate?: (direction: NavDirection) => void;
    onEditModeChange?: (editing: boolean) => void;
    onContentChange?: (html: string) => void;
}

const TextEditor: React.FC<TextEditProps> = ({
    displayNav,
    editable,
    entry,
    onNavigate,
    onEditModeChange,
    onContentChange
}) => {
    const [html, setHtml] = useState('');
    const [displayNavState, setDisplayNavState] = useState(displayNav);
    const [editableState, setEditableState] = useState(editable);
    const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const handleDelete = async () => {
        if (!entry) return;
        const confirmed = window.confirm('Are you sure you want to delete this entry?');
        confirmed && await deleteEntry(entry.id, navigate);
    };

    const onChange = (e: ContentEditableEvent) => {
        setHtml(e.target.value);
        onContentChange?.(e.target.value);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            document.execCommand('insertText', false, '    ');
        }
    };

    const toggleEditMode = () => {
        setEditableState(true);
        setDisplayNavState(false);
        onEditModeChange?.(true);
    };

    // Prevent Chromium from injecting the app background into clipboard HTML
    const onCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        const tmp = document.createElement('div');
        tmp.append(sel.getRangeAt(0).cloneContents());
        e.clipboardData.setData('text/html', tmp.innerHTML);
        e.clipboardData.setData('text/plain', sel.toString());
        e.preventDefault();
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        if (!editableState) return;
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;
        // Capture caret position at drop point before FileReader async
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        }
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                document.execCommand('insertHTML', false, `<img src="${reader.result as string}" width="${DEFAULT_IMAGE_WIDTH}" />`);
            };
            reader.readAsDataURL(file);
        });
    };

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!editableState) return;
        const target = e.target as HTMLElement;
        if (target.dataset.resizeHandle) return;
        setSelectedImg(target.tagName === 'IMG' ? target as HTMLImageElement : null);
    };

    useEffect(() => {
        if (entry?.content) {
            setHtml(entry.content);
            setDisplayNavState(displayNav);
            onContentChange?.(entry.content);
        } else {
            setHtml('');
            onContentChange?.('');
        }
        setEditableState(editable);
        onEditModeChange?.(editable);
        setSelectedImg(null);
    }, [entry?.id, displayNav, editable]);

    return (
        <div className="flex flex-col">
            <TextEditNav
                displayNav={displayNavState}
                onToggleEditMode={toggleEditMode}
                onDelete={handleDelete}
                onNavigate={onNavigate}
            />

            <div ref={containerRef} style={{ position: 'relative' }} onCopy={onCopy} onDragOver={onDragOver} onDrop={onDrop} onClick={handleClick}>
                <Editor value={html} onChange={onChange} disabled={!editableState} onKeyDown={onKeyDown} spellCheck={true}>
                    <Toolbar />
                </Editor>

                {editableState && selectedImg && containerRef.current && (
                    <ImageResizeOverlay
                        img={selectedImg}
                        container={containerRef.current}
                        onResize={html => { setHtml(html); onContentChange?.(html); }}
                    />
                )}
            </div>
        </div>
    );
};

export default TextEditor;
