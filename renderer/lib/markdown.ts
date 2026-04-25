import TurndownService from 'turndown';
import { marked } from 'marked';

const __turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });

// Preserve base64 <img> tags as raw HTML so width attributes survive the
// round-trip through markdown. Turndown's default image rule converts
// <img src="data:..."> to ![](data:...) which drops width and changes format.
__turndown.addRule('base64Image', {
  filter: (node) => {
    const el = node as Element;
    return el.nodeName === 'IMG' && (el.getAttribute('src') ?? '').startsWith('data:');
  },
  replacement: (_content, node) => {
    const el = node as Element;
    const src = el.getAttribute('src') ?? '';
    const width = el.getAttribute('width') ?? '';
    const alt = el.getAttribute('alt') ?? '';
    return `<img src="${src}"${width ? ` width="${width}"` : ''}${alt ? ` alt="${alt}"` : ''} />`;
  },
});

// Converts WYSIWYG editor HTML to Markdown for DB storage.
export function htmlToMarkdown(html: string): string {
  return __turndown.turndown(html);
}

// Converts stored Markdown to HTML for display in the WYSIWYG editor.
export function markdownToHtml(md: string): string {
  return marked.parse(md) as string;
}

