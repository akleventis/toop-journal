import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'qwen2.5:7b-instruct';
const OLLAMA_BIN = '/opt/homebrew/bin/ollama';

// ┌───────────────┬────────┬──────────────────────────────────────────────┐
// │   Endpoint    │ Method │ Purpose                                      │
// ├───────────────┼────────┼──────────────────────────────────────────────┤
// │ /api/tags     │ GET    │ List installed models — used for health check │
// │ /api/chat     │ POST   │ Send messages, get response — main endpoint  │
// │ /api/generate │ POST   │ Raw completion (no message history) — unused │
// │ /api/show     │ POST   │ Model info/metadata                          │
// │ /api/pull     │ POST   │ Download a model                             │
// │ /api/delete   │ DELETE │ Remove a model                               │
// └───────────────┴────────┴──────────────────────────────────────────────┘

let ollamaProcess: ChildProcess | null = null;

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export function startOllama(): void {
  if (!existsSync(OLLAMA_BIN)) {
    throw new Error('Ollama not found. Install it with: brew install ollama');
  }
  ollamaProcess = spawn(OLLAMA_BIN, ['serve'], { detached: false });
}

export function stopOllama(): void {
  ollamaProcess?.kill();
  ollamaProcess = null;
}

// stream: false for Phase 1 — will switch to true in Phase 5
type OllamaToolCall = { id: string; function: { name: string; arguments: Record<string, unknown> } };

export async function chat(
  messages: { role: string; content: string }[],
  tools?: unknown[]
): Promise<{ content: string; tool_calls?: OllamaToolCall[] }> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages, tools, stream: false, options: { num_ctx: 8192 } }),
    });
  } catch {
    throw new Error('Ollama is not running. Start it with: brew services start ollama');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }

  const data = await res.json() as { message: { content: string; tool_calls?: OllamaToolCall[] } };
  console.log('[ollama raw]', JSON.stringify(data.message, null, 2));
  return data.message;
}
