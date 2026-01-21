/* eslint-disable */
import type {
  ChatMessage,
  StreamEvent,
  ApiError,
  MessagePart,
  Attachment,
} from '../types';

const API_BASE_URL = '/api/v1';

// 将附件转换为 Gemini API 需要的 Part 格式
export function attachmentsToParts(attachments: Attachment[]): MessagePart[] {
  return attachments.map((attachment) => ({
    inlineData: {
      data: attachment.data,
      mimeType: attachment.type,
    },
  }));
}

// 构建发送给服务器的消息 parts
export function buildMessageParts(
  text: string,
  attachments?: Attachment[],
): MessagePart[] {
  const parts: MessagePart[] = [];

  // 先添加多模态内容（图片、视频等）
  if (attachments && attachments.length > 0) {
    parts.push(...attachmentsToParts(attachments));
  }

  // 再添加文本内容
  if (text.trim()) {
    parts.push({ text });
  }

  return parts;
}

export interface SessionMetadata {
  id: string;
  title: string;
  workDir: string;
  createdAt: number;
  updatedAt: number;
}

export interface SessionWithMessages extends SessionMetadata {
  messages: ChatMessage[];
}

export class ApiClient {
  private abortController: AbortController | null = null;

  // 获取所有会话
  async getSessions(): Promise<SessionMetadata[]> {
    const response = await fetch(`${API_BASE_URL}/sessions`);
    if (!response.ok) {
      throw new Error('Failed to fetch sessions');
    }
    return response.json();
  }

  // 获取单个会话（含消息）
  async getSession(sessionId: string): Promise<SessionWithMessages> {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch session');
    }
    return response.json();
  }

  // 更新会话标题
  async updateSession(
    sessionId: string,
    updates: { title?: string },
  ): Promise<SessionMetadata> {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      throw new Error('Failed to update session');
    }
    return response.json();
  }

  // 删除会话
  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete session');
    }
  }

  async sendMessage(
    message: string,
    sessionId?: string,
    onStream?: (event: StreamEvent) => void,
    attachments?: Attachment[],
  ): Promise<ChatMessage & { sessionId?: string }> {
    // 取消之前的请求
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();

    try {
      // 构建请求体
      const requestBody: {
        message: string;
        sessionId?: string;
        parts?: MessagePart[];
      } = {
        message,
        sessionId,
      };

      // 如果有附件，构建多模态 parts
      if (attachments && attachments.length > 0) {
        requestBody.parts = buildMessageParts(message, attachments);
      }

      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.message || 'Failed to send message');
      }

      // 检查是否是流式响应
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('text/event-stream')) {
        return this.handleStreamResponse(response, onStream);
      } else {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request cancelled');
      }
      throw error;
    }
  }

  private async handleStreamResponse(
    response: Response,
    onStream?: (event: StreamEvent) => void,
  ): Promise<ChatMessage & { sessionId?: string }> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let messageId = '';
    let returnSessionId: string | undefined;
    let buffer = ''; // 用于缓存不完整的 SSE 数据

    if (!reader) {
      throw new Error('No response body');
    }

    // 处理单个 SSE 事件
    const processEvent = (eventData: string) => {
      try {
        const data = JSON.parse(eventData);

        if (data.type === 'session') {
          // 会话信息事件
          returnSessionId = data.sessionId;
          onStream?.({
            type: 'session' as any,
            data: { sessionId: data.sessionId, workDir: data.workDir },
          });
        } else if (data.type === 'messageId') {
          // 初始消息 ID 事件
          messageId = data.messageId || messageId;
        } else if (data.type === 'text') {
          fullContent += data.content || '';
          messageId = data.messageId || messageId;
          onStream?.({
            type: 'text',
            data: { content: data.content, messageId },
          });
        } else if (data.type === 'thought') {
          onStream?.({
            type: 'thought',
            data: { thought: data.thought },
          });
        } else if (data.type === 'tool_call') {
          onStream?.({
            type: 'tool_call',
            data: data.toolCall,
          });
        } else if (data.type === 'tool_result') {
          onStream?.({
            type: 'tool_result',
            data: data.result,
          });
        } else if (data.type === 'error') {
          onStream?.({
            type: 'error',
            data: data.error,
          });
        } else if (data.type === 'done') {
          onStream?.({
            type: 'done',
            data: {},
          });
        }
      } catch (e) {
        console.error('Failed to parse SSE data:', eventData, e);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // SSE 事件以 \n\n 分隔，处理完整的事件
        const events = buffer.split('\n\n');
        // 最后一个可能是不完整的，保留在 buffer 中
        buffer = events.pop() || '';

        for (const event of events) {
          const lines = event.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              processEvent(line.slice(6));
            }
          }
        }
      }

      // 处理 buffer 中剩余的数据
      if (buffer.trim()) {
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            processEvent(line.slice(6));
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      id: messageId || `msg-${Date.now()}`,
      role: 'assistant',
      content: fullContent,
      timestamp: Date.now(),
      sessionId: returnSessionId,
    };
  }

  async confirmToolCall(toolCallId: string, confirmed: boolean): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/tools/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        toolCallId,
        confirmed,
      }),
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || 'Failed to confirm tool call');
    }
  }

  cancelRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export const apiClient = new ApiClient();
