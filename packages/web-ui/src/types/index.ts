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
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done';
  data: unknown;
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
