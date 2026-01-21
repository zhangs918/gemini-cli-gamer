/* eslint-disable */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
}

export interface StreamEvent {
  type:
    | 'text'
    | 'thought'
    | 'tool_call'
    | 'tool_result'
    | 'error'
    | 'done'
    | 'session';
  data: unknown;
}

export interface ThoughtSummary {
  subject: string;
  description: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  requiresConfirmation: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
}
