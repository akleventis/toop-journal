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

const stripInlineStyles = (html: string): string => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll<HTMLElement>('[style]').forEach(el => el.removeAttribute('style'));
    return tmp.innerHTML;
};

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
    const [isEditing, setIsEditing] = useState(editable);
    const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const showNav = displayNav && !isEditing;

    const handleDelete = async () => {
        if (!entry) return;
        const confirmed = window.confirm('Are you sure you want to delete this entry?');
        confirmed && await deleteEntry(entry.id, navigate);
    };

    const onChange = (e: ContentEditableEvent) => {
        const clean = stripInlineStyles(e.target.value);
        setHtml(clean);
        onContentChange?.(clean);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const sel = window.getSelection();
            if (!sel?.rangeCount) return;
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const tab = document.createTextNode('\t');
            range.insertNode(tab);
            range.setStartAfter(tab);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            tab.parentElement?.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    const toggleEditMode = () => {
        setIsEditing(true);
        onEditModeChange?.(true);
    };

    const onCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        e.clipboardData.setData('text/plain', sel.toString());
        e.preventDefault();
    };

    const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        if (text) document.execCommand('insertText', false, text);
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        if (!isEditing) return;
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
        if (!isEditing) return;
        const target = e.target as HTMLElement;
        if (target.dataset.resizeHandle) return;
        setSelectedImg(target.tagName === 'IMG' ? target as HTMLImageElement : null);
    };

    useEffect(() => {
        const content = entry?.content ?? '';
        setHtml(content);
        onContentChange?.(content);
        setIsEditing(editable);
        onEditModeChange?.(editable);
        setSelectedImg(null);
    }, [entry?.id, editable]);

    return (
        <div className="flex flex-col">
            <TextEditNav
                displayNav={showNav}
                onToggleEditMode={toggleEditMode}
                onDelete={handleDelete}
                onNavigate={onNavigate}
            />

            <div ref={containerRef} style={{ position: 'relative' }} onCopy={onCopy} onPaste={onPaste} onDragOver={onDragOver} onDrop={onDrop} onClick={handleClick}>
                <Editor value={html} onChange={onChange} disabled={!isEditing} onKeyDown={onKeyDown} spellCheck={true}>
                    <Toolbar />
                </Editor>

                {isEditing && selectedImg && containerRef.current && (
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
