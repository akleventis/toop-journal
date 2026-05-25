import { chat } from './ollama';
import { toolDefinitions, executeTool, getJournalSpan } from './tools';
import { SYSTEM_PROMPT } from './system-prompt';

const MAX_ITERATIONS = 20;

function formatToolResult(result: unknown): string {
  if (!result) return 'No result.';
  return JSON.stringify(result);
}

type ToolCall = { id: string; function: { name: string; arguments: Record<string, unknown> } };
type Message = { role: string; content: string; tool_calls?: ToolCall[]; tool_call_id?: string };

// qwen2.5 sometimes wraps args as { type: "string", value: "..." } — flatten to plain values
function normalizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[k] = (v && typeof v === 'object' && 'value' in v) ? (v as { value: unknown }).value : v;
  }
  return out;
}

const conversationHistory: Message[] = [];

export async function runAgentLoop(userMessage: string): Promise<string> {
  conversationHistory.push({ role: 'user', content: userMessage });

  const span = getJournalSpan();
  const spanNote = span
    ? `\n\nJournal spans ${span.startYear}–${span.endYear} (${span.total} total entries).`
    : '';

  const messages: Message[] = [
    { role: 'system', content: SYSTEM_PROMPT + spanNote },
    ...conversationHistory,
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await chat(messages, toolDefinitions);

    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push({ role: 'assistant', content: response.content, tool_calls: response.tool_calls });

      for (const toolCall of response.tool_calls) {
        const args = normalizeArgs(toolCall.function.arguments);
        const result = executeTool(toolCall.function.name, args);
        const content = formatToolResult(result);
        messages.push({ role: 'tool', content, tool_call_id: toolCall.id });
      }
      continue;
    }

    conversationHistory.push({ role: 'assistant', content: response.content });
    return response.content;
  }

  return 'Max iterations reached without a final response.';
}

export function clearHistory(): void {
  conversationHistory.length = 0;
}
