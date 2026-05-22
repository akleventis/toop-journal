import React, { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.core.css';
import { useNavigate } from 'react-router-dom';
import TextEditNav from './TextEditNav';
import ImageResizeOverlay from './ImageResizeOverlay';
import type { Entry } from '../../../shared/types';
import { deleteEntry } from '../../lib/entries';
import { NavDirection } from '../../lib/constants';

const DEFAULT_IMAGE_WIDTH = 200;
const Delta = Quill.import('delta') as any;

interface TextEditProps {
    displayNav: boolean;
    editable: boolean;
    entry: Entry | null;
    onNavigate?: (direction: NavDirection) => void;
    onEditModeChange?: (editing: boolean) => void;
    onContentChange?: (html: string) => void;
}

const QuillEditor: React.FC<TextEditProps> = ({
    displayNav,
    editable,
    entry,
    onNavigate,
    onEditModeChange,
    onContentChange,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorDivRef = useRef<HTMLDivElement>(null);
    const quillRef = useRef<Quill | null>(null);
    const onContentChangeRef = useRef(onContentChange);
    const [isEditing, setIsEditing] = useState(editable);
    const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
    const navigate = useNavigate();

    useEffect(() => { onContentChangeRef.current = onContentChange; });

    useEffect(() => {
        if (!editorDivRef.current || quillRef.current) return;

        const quill = new Quill(editorDivRef.current, {
            readOnly: !editable,
            modules: {
                toolbar: false,
                // matchVisual: false prevents Quill from adding spurious line breaks when pasting
                clipboard: { matchVisual: false },
                history: { delay: 1000, maxStack: 500, userOnly: true },
                keyboard: {
                    bindings: {
                        // Override Quill's default Tab: inconsistent between line-start (block indent) and mid-text (\t).
                        tab: {
                            key: 'Tab',
                            shiftKey: false,
                            handler(range: { index: number; length: number }) {
                                quill.deleteText(range.index, range.length, 'user');
                                quill.insertText(range.index, '    ', 'user');
                                quill.setSelection(range.index + 4, 0, 'silent');
                                return false;
                            },
                        },
                    },
                },
            },
        });

        // Plain text only paste — capture phase + stopImmediatePropagation prevents
        // Quill's own capture-phase clipboard handler from also inserting rich content.
        quill.root.addEventListener('paste', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            const text = e.clipboardData?.getData('text/plain') ?? '';
            if (!text) return;
            const sel = quill.getSelection(true);
            quill.deleteText(sel.index, sel.length, 'user');
            quill.insertText(sel.index, text, 'user');
            quill.setSelection(sel.index + text.length, 0, 'silent');
        }, { capture: true });

        // Plain text only copy — capture phase + stopImmediatePropagation mirrors the paste fix:
        // prevents Quill's own clipboard handler from overwriting or interfering.
        // quill.getText reads from Delta (authoritative) instead of the DOM.
        quill.root.addEventListener('copy', (e) => {
            const range = quill.getSelection();
            if (!range || !range.length) return;
            e.clipboardData?.setData('text/plain', quill.getText(range.index, range.length));
            e.preventDefault();
            e.stopImmediatePropagation();
        }, { capture: true });

        // Image drag-drop
        // capture: true so our handler runs before Quill's clipboard drop handler,
        // then stopImmediatePropagation prevents Quill from also inserting the image.
        quill.root.addEventListener('dragover', (e) => e.preventDefault(), { capture: true });
        quill.root.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();

            const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'));
            if (!files.length) return;
            const range = quill.getSelection(true) ?? { index: quill.getLength(), length: 0 };
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = () => {
                    quill.insertEmbed(range.index, 'image', reader.result as string, 'user');
                    // Set default width directly — Quill's default image blot doesn't support width attributes,
                    // so we set it on the DOM element after insertion.
                    const img = quill.root.querySelector<HTMLImageElement>(`img[src="${reader.result}"]`);
                    if (img) img.setAttribute('width', String(DEFAULT_IMAGE_WIDTH));
                    onContentChangeRef.current?.(quill.root.innerHTML);
                };
                reader.readAsDataURL(file);
            });
        }, { capture: true });

        // Image click → resize overlay
        quill.root.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.dataset.resizeHandle) return;
            setSelectedImg(target.tagName === 'IMG' ? target as HTMLImageElement : null);
        });

        quill.on('text-change', (_delta, _old, source) => {
            if (source === 'user') {
                setSelectedImg(null);
                onContentChangeRef.current?.(quill.root.innerHTML);
            }
        });

        // Preserve raw text content (including \t) when loading HTML via dangerouslyPasteHTML.
        quill.clipboard.addMatcher(Node.TEXT_NODE, (node: Node) =>
            new Delta().insert((node as Text).data)
        );

        // Remove Quill's built-in "- " → bullet list auto-conversion.
        const keyboard = quill.getModule('keyboard') as any;
        Object.keys(keyboard.bindings).forEach(key => {
            keyboard.bindings[key] = keyboard.bindings[key]?.filter(
                (b: any) => !(b?.format?.['code-block'] === false && b?.format?.blockquote === false)
            );
        });

        quillRef.current = quill;
    }, []);

    // Reload content when entry changes or edit mode toggles
    useEffect(() => {
        const quill = quillRef.current;
        if (!quill) return;

        quill.enable(false);
        quill.history.clear();
        quill.clipboard.dangerouslyPasteHTML(entry?.content ?? '');
        quill.enable(editable);
        quill.history.clear();

        setIsEditing(editable);
        setSelectedImg(null);
        onEditModeChange?.(editable);
        onContentChangeRef.current?.(entry?.content ?? '');
        // Focus after enable — init-effect focus is overridden by enable(false) above
        if (editable) quill.focus();
    }, [entry?.id, editable]);

    const handleDelete = async () => {
        if (!entry) return;
        if (window.confirm('Are you sure you want to delete this entry?')) {
            await deleteEntry(entry.id, navigate);
        }
    };

    const toggleEditMode = () => {
        quillRef.current?.enable(true);
        setIsEditing(true);
        onEditModeChange?.(true);
    };

    return (
        <div className="flex flex-col">
            <TextEditNav
                displayNav={displayNav && !isEditing}
                onToggleEditMode={toggleEditMode}
                onDelete={handleDelete}
                onNavigate={onNavigate}
            />
            <div ref={containerRef} style={{ position: 'relative' }}>
                <div ref={editorDivRef} />
                {isEditing && selectedImg && containerRef.current && (
                    <ImageResizeOverlay
                        img={selectedImg}
                        container={containerRef.current}
                        onResize={() => {
                            onContentChangeRef.current?.(quillRef.current?.root.innerHTML ?? '');
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default QuillEditor;
