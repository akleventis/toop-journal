import React, { useState, useEffect } from 'react';
import Editor, { Toolbar } from 'react-simple-wysiwyg';
import { useNavigate } from 'react-router-dom';
import TextEditNav from './TextEditNav';
import * as idb from '../../db/idb';
import type { Entry } from '../../lib/types';
import { decodeHtmlEntities, encodeHtmlEntities, formatCurrentDate, generateIdFromDate } from '../../lib/utils';
import { NavDirection } from '../../lib/constants';

interface TextEditProps {
    displayNav: boolean; // display settings and navigation buttons
    editable: boolean; // true if editable
    entry: Entry | null; // entry to view or edit
    isNewEntry: boolean; // true if creating a new entry
    onNavigate?: (direction: NavDirection) => void; // navigate to previous or next entry (if in view mode)
}

const TextEditor: React.FC<TextEditProps> = ({
    displayNav,
    editable,
    entry,
    isNewEntry,
    onNavigate
}) => {
    const [html, setHtml] = useState('');
    const [displayNavState, setDisplayNavState] = useState(displayNav);
    const [editableState, setEditableState] = useState(editable);
    const navigate = useNavigate();

    // Delete entry after confirmation
    const handleDelete = async () => {
        if (entry) {
            const confirmed = window.confirm('Are you sure you want to delete this entry?');
            if (confirmed) {
                await idb.idbDeleteEntry(entry.id);
                navigate('/list?reload=true');
            }
        }
    };

    // Save entry to database and navigate to list
    const handleSave = async () => {
        const encodedHtml = encodeHtmlEntities(html);

        console.log("encodedHtml", encodedHtml.trim().length);
        if (encodedHtml.trim() === '') {
            navigate('/list');
            return;
        }

        if (isNewEntry) {
            const entryDate = formatCurrentDate();
            const entry: Entry = {
                id: generateIdFromDate(entryDate),
                date: entryDate,
                content: encodedHtml,
                timestamp: Date.now()
            };
            await idb.idbCreateEntry(entry);
        } else if (entry) {
            await idb.idbUpdateEntry(entry.id, { content: encodedHtml });
        }
        navigate('/list?reload=true');
    };

    const onChange = (e: any) => {
        setHtml(e.target.value);
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
    };

    useEffect(() => {
        if (entry?.content) {
            const decodedHtml = decodeHtmlEntities(entry.content);
            setHtml(decodedHtml);
            setDisplayNavState(displayNav);
        } else {
            setHtml('');
        }
    }, [entry?.id, displayNav]);

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <TextEditNav
                displayNav={displayNavState}
                onToggleEditMode={toggleEditMode}
                onDelete={handleDelete}
                onNavigate={onNavigate}
            />

            <Editor value={html} onChange={onChange} disabled={!editableState} onKeyDown={onKeyDown}>
                <Toolbar>
                </Toolbar>
            </Editor>

            {editableState && (
                <div style={{ padding: '8px', borderTop: '1px solid var(--border-color)', textAlign: 'right' }}>
                    <button onClick={handleSave} style={{ padding: '8px 16px', margin: '10px', fontSize: '12px' }} > Done </button>
                </div>
            )}
        </div>
    );
};

export default TextEditor;