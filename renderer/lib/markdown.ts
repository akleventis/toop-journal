import { marked } from 'marked';

// one-time migration: converts legacy markdown entries to HTML on first launch
export function markdownToHtml(md: string): string {
  return marked.parse(md) as string;
}

