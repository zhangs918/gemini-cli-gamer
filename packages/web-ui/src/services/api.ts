/* eslint-disable */
import type { ChatMessage, StreamEvent, ApiError } from '../types';

const API_BASE_URL = '/api/v1';

export class ApiClient {
  private abortController: AbortController | null = null;

  async sendMessage(
    message: string,
    sessionId?: string,
    onStream?: (event: StreamEvent) => void,
  ): Promise<ChatMessage> {
    // 取消之前的请求
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();

    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          sessionId,
        }),
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
  ): Promise<ChatMessage> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let messageId = '';

    if (!reader) {
      throw new Error('No response body');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'messageId') {
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
                break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
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
