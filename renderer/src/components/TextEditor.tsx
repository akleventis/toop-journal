import React, { useState, useEffect } from 'react';
import Editor, { Toolbar } from 'react-simple-wysiwyg';
import { useNavigate } from 'react-router-dom';
import TextEditNav from './TextEditNav';
import type { Entry } from '../../lib/types';
import { markdownToHtml, deleteEntry } from '../../lib/utils';
import { NavDirection } from '../../lib/constants';

interface TextEditProps {
    displayNav: boolean; // display settings and navigation buttons
    editable: boolean; // true if editable
    entry: Entry | null; // entry to view or edit
    onNavigate?: (direction: NavDirection) => void; // navigate to previous or next entry (if in view mode)
    onEditModeChange?: (editing: boolean) => void; // callback when edit mode changes
    onContentChange?: (html: string) => void; // callback when content changes
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
    const navigate = useNavigate();

    const handleDelete = async () => {
        if (!entry) return;
        const confirmed = window.confirm('Are you sure you want to delete this entry?');
        confirmed && await deleteEntry(entry.id, navigate);
    };


    const onChange = (e: any) => {
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

    useEffect(() => {
        if (entry?.content) {
            const decodedHtml = markdownToHtml(entry.content);
            setHtml(decodedHtml);
            setDisplayNavState(displayNav);
            onContentChange?.(decodedHtml);
        } else {
            setHtml('');
            onContentChange?.('');
        }
        setEditableState(editable);
        onEditModeChange?.(editable);
    }, [entry?.id, displayNav, editable]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <TextEditNav
                displayNav={displayNavState}
                onToggleEditMode={toggleEditMode}
                onDelete={handleDelete}
                onNavigate={onNavigate}
            />

            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                <Editor value={html} onChange={onChange} disabled={!editableState} onKeyDown={onKeyDown}>
                    <Toolbar>
                    </Toolbar>
                </Editor>
            </div>
        </div>
    );
};

export default TextEditor;