import TurndownService from 'turndown';
import { marked } from 'marked';

const __turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

/**
 * Converts HTML (from the WYSIWYG editor) to Markdown for DB storage.
 */
export function htmlToMarkdown(html: string): string {
  return __turndown.turndown(html);
}

/**
 * Converts stored Markdown to HTML for display in the WYSIWYG editor.
 */
export function markdownToHtml(md: string): string {
  return marked.parse(md) as string;
}

