/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type express from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Config } from '@google/gemini-cli-core';
import { GeminiClient, GeminiEventType } from '@google/gemini-cli-core';
import { logger } from '../utils/logger.js';

interface ChatSession {
  id: string;
  client: GeminiClient;
  createdAt: number;
}

// 简单的内存会话存储（生产环境应使用 Redis 等）
const sessions = new Map<string, ChatSession>();

async function getOrCreateSession(
  sessionId: string | undefined,
  config: Config,
): Promise<ChatSession> {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    // 检查会话是否过期（24小时）
    if (Date.now() - session.createdAt < 24 * 60 * 60 * 1000) {
      return session;
    }
    sessions.delete(sessionId);
  }

  const newSessionId = sessionId || uuidv4();
  const client = new GeminiClient(config);
  // 初始化 chat - resumeChat 会调用 startChat 并设置 client.chat
  await client.resumeChat([]);

  const session: ChatSession = {
    id: newSessionId,
    client,
    createdAt: Date.now(),
  };
  sessions.set(newSessionId, session);
  return session;
}

export function setupChatRoutes(app: express.Express, config: Config): void {
  // POST /api/v1/chat - 发送消息并获取流式响应
  app.post('/api/v1/chat', async (req, res): Promise<void> => {
    try {
      const { message, sessionId } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Invalid message field' });
        return;
      }

      const session = await getOrCreateSession(sessionId, config);
      const promptId = uuidv4();

      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲

      // 发送初始消息 ID
      res.write(
        `data: ${JSON.stringify({ type: 'messageId', messageId: promptId })}\n\n`,
      );

      const abortController = new AbortController();
      req.on('close', () => {
        abortController.abort();
      });

      try {
        const stream = session.client.sendMessageStream(
          message,
          abortController.signal,
          promptId,
        );

        for await (const event of stream) {
          if (abortController.signal.aborted) {
            res.write(
              `data: ${JSON.stringify({ type: 'error', error: 'Request cancelled' })}\n\n`,
            );
            break;
          }

          if (event.type === GeminiEventType.Content) {
            // Content 事件的 value 是 string 类型
            const text = typeof event.value === 'string' ? event.value : '';
            if (text) {
              res.write(
                `data: ${JSON.stringify({ type: 'text', content: text, messageId: promptId })}\n\n`,
              );
            }
          } else if (event.type === GeminiEventType.Thought) {
            // Thought 事件：AI 的思考过程
            const thoughtValue = event.value;
            res.write(
              `data: ${JSON.stringify({
                type: 'thought',
                thought: thoughtValue,
                messageId: promptId,
              })}\n\n`,
            );
          } else if (event.type === GeminiEventType.ToolCallRequest) {
            // ToolCallRequest 事件的 value 是 ToolCallRequestInfo 类型
            const toolCall = event.value;
            if (
              toolCall &&
              typeof toolCall === 'object' &&
              'callId' in toolCall
            ) {
              res.write(
                `data: ${JSON.stringify({
                  type: 'tool_call',
                  toolCall: {
                    id: toolCall.callId || uuidv4(),
                    name: toolCall.name || 'unknown',
                    args: toolCall.args || {},
                    requiresConfirmation: false, // YOLO mode: 无需确认，直接执行
                  },
                })}\n\n`,
              );
              // YOLO mode: 不暂停流式响应，继续处理后续事件
              // 工具会自动执行，不需要等待用户确认
            }
          } else if (event.type === GeminiEventType.ToolCallResponse) {
            const toolResult = event.value;
            res.write(
              `data: ${JSON.stringify({
                type: 'tool_result',
                result: toolResult,
              })}\n\n`,
            );
          } else if (event.type === GeminiEventType.Error) {
            const errorValue = event.value as { message?: string } | undefined;
            res.write(
              `data: ${JSON.stringify({
                type: 'error',
                error: errorValue?.message || 'Unknown error',
              })}\n\n`,
            );
            break;
          } else if (event.type === GeminiEventType.Finished) {
            // 完成事件
            break;
          }
        }

        // 发送完成信号
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        return;
      } catch (error) {
        logger.error('[ChatAPI] Error processing stream:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`,
        );
        res.end();
        return;
      }
    } catch (error) {
      logger.error('[ChatAPI] Error handling chat request:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      if (!res.headersSent) {
        res.status(500).json({ error: errorMessage });
      }
      return;
    }
  });

  // POST /api/v1/tools/confirm - 确认工具调用
  app.post('/api/v1/tools/confirm', async (req, res) => {
    try {
      const { toolCallId, confirmed, sessionId } = req.body;

      if (!toolCallId || typeof confirmed !== 'boolean') {
        return res.status(400).json({
          error: 'Invalid toolCallId or confirmed field',
        });
      }

      if (!sessionId || !sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // TODO: 实现工具确认逻辑
      // 这里需要与 Config 的确认总线集成
      logger.info(
        `[ChatAPI] Tool call ${toolCallId} ${confirmed ? 'confirmed' : 'rejected'}`,
      );

      return res.json({ success: true });
    } catch (error) {
      logger.error('[ChatAPI] Error confirming tool call:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: errorMessage });
    }
  });

  // GET /api/v1/session/:sessionId - 获取会话信息
  app.get('/api/v1/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({
      id: session.id,
      createdAt: session.createdAt,
    });
  });
}
