import React, { useState, useEffect } from 'react';
import Editor, { Toolbar } from 'react-simple-wysiwyg';
import type { ContentEditableEvent } from 'react-simple-wysiwyg';
import { useNavigate } from 'react-router-dom';
import TextEditNav from './TextEditNav';
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
    const [imageWidth, setImageWidth] = useState(DEFAULT_IMAGE_WIDTH);
    const navigate = useNavigate();

    useEffect(() => {
        window.sqlite.getSetting('imageWidth').then(v => {
            if (v) setImageWidth(parseInt(v, 10));
        });
    }, []);

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

    // Strip HTML on copy; collapse \n\n between <p> blocks (macOS selection.toString()
    // behavior) to \n so copied text matches the visual single-line-break display.
    const onCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection) {
            e.clipboardData.setData('text/plain', selection.toString().replace(/\n{2,}/g, '\n'));
        }
    };

    const toggleEditMode = () => {
        setEditableState(true);
        setDisplayNavState(false);
        onEditModeChange?.(true);
    };

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

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
                const src = reader.result as string;
                document.execCommand('insertHTML', false, `<img src="${src}" width="${imageWidth}" />`);
            };
            reader.readAsDataURL(file);
        });
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
    }, [entry?.id, displayNav, editable]);

    return (
        <div className="flex flex-col">
            <TextEditNav
                displayNav={displayNavState}
                onToggleEditMode={toggleEditMode}
                onDelete={handleDelete}
                onNavigate={onNavigate}
            />

            <div onDragOver={onDragOver} onDrop={onDrop} onCopy={onCopy}>
                <Editor value={html} onChange={onChange} disabled={!editableState} onKeyDown={onKeyDown} spellCheck={true}>
                    <Toolbar>
                    </Toolbar>
                </Editor>
            </div>
        </div>
    );
};

export default TextEditor;
