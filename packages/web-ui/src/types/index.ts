/* eslint-disable */

// 多模态 Part 类型 - 与 @google/genai 的 Part 类型兼容
export interface InlineDataPart {
  inlineData: {
    data: string; // base64 encoded
    mimeType: string;
  };
}

export interface TextPart {
  text: string;
}

export type MessagePart = TextPart | InlineDataPart;

// 附件信息（用于 UI 显示）
export interface Attachment {
  id: string;
  name: string;
  type: string; // mimeType
  size: number;
  data: string; // base64 encoded
  previewUrl?: string; // 用于图片/视频预览
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: Attachment[]; // 多模态附件
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
