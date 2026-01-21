/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type express from 'express';
import { v4 as uuidv4 } from 'uuid';
import type {
  Config,
  ToolCallRequestInfo,
  GeminiCLIExtension,
} from '@google/gemini-cli-core';
import { SimpleExtensionLoader } from '@google/gemini-cli-core';
import { GeminiEventType, executeToolCall } from '@google/gemini-cli-core';
import type { Part } from '@google/genai';
import { logger } from '../utils/logger.js';
import { Task } from '../agent/task.js';
import { createSessionConfig, generateRandomId } from '../config/config.js';
import type { Settings } from '../config/settings.js';
import {
  getSessionStore,
  type StoredMessage,
} from '../storage/session-store.js';

interface ChatSession {
  id: string;
  task: Task;
  config: Config;
  workDir: string;
  createdAt: number;
}

// 内存中的活跃会话（用于保持 Gemini 客户端连接）
const activeSessions = new Map<string, ChatSession>();

// 会话创建所需的上下文
interface SessionContext {
  settings: Settings;
  extensions: GeminiCLIExtension[];
  baseConfig: Config;
}

let sessionContext: SessionContext | undefined;

/**
 * 设置会话创建所需的上下文
 */
export function setSessionContext(context: SessionContext): void {
  sessionContext = context;
}

async function getOrCreateSession(
  sessionId: string | undefined,
  _baseConfig: Config,
): Promise<ChatSession> {
  const store = getSessionStore();

  // 检查内存中的活跃会话
  if (sessionId && activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId)!;
    // 检查会话是否过期（24小时）
    if (Date.now() - session.createdAt < 24 * 60 * 60 * 1000) {
      return session;
    }
    activeSessions.delete(sessionId);
  }

  // 检查持久化存储中的会话
  if (sessionId && store.hasSession(sessionId)) {
    const storedSession = store.getSession(sessionId)!;
    const workDirPath = store.getWorkDirPath(sessionId)!;

    logger.info(
      `[ChatAPI] Restoring session ${sessionId} with work directory: ${workDirPath}`,
    );

    // 重建会话
    if (!sessionContext) {
      throw new Error('[ChatAPI] Session context not set.');
    }

    const sessionExtensionLoader = new SimpleExtensionLoader(
      sessionContext.extensions,
    );

    const config = await createSessionConfig(
      sessionContext.settings,
      sessionExtensionLoader,
      sessionId,
      workDirPath,
    );

    const contextId = uuidv4();
    const task = await Task.create(
      sessionId,
      contextId,
      config,
      undefined,
      true,
    );
    await task.geminiClient.initialize();

    const session: ChatSession = {
      id: sessionId,
      task,
      config,
      workDir: workDirPath,
      createdAt: storedSession.createdAt,
    };
    activeSessions.set(sessionId, session);
    return session;
  }

  // 创建新会话
  const newSessionId = sessionId || `session-${Date.now()}`;
  const workDirName = generateRandomId();

  if (!sessionContext) {
    throw new Error('[ChatAPI] Session context not set.');
  }

  // 在持久化存储中创建会话
  const storedSession = store.createSession(newSessionId, workDirName);
  const workDirPath = store.getWorkDirPath(newSessionId)!;

  logger.info(
    `[ChatAPI] New session ${newSessionId} using work directory: ${workDirPath}`,
  );

  const sessionExtensionLoader = new SimpleExtensionLoader(
    sessionContext.extensions,
  );

  const config = await createSessionConfig(
    sessionContext.settings,
    sessionExtensionLoader,
    newSessionId,
    workDirPath,
  );

  const contextId = uuidv4();
  const task = await Task.create(
    newSessionId,
    contextId,
    config,
    undefined,
    true,
  );
  await task.geminiClient.initialize();

  const session: ChatSession = {
    id: newSessionId,
    task,
    config,
    workDir: workDirPath,
    createdAt: storedSession.createdAt,
  };
  activeSessions.set(newSessionId, session);
  return session;
}

export function setupChatRoutes(app: express.Express, config: Config): void {
  const store = getSessionStore();

  // GET /api/v1/sessions - 获取所有会话
  app.get('/api/v1/sessions', (_req, res) => {
    const sessions = store.listSessions();
    return res.json(sessions);
  });

  // GET /api/v1/sessions/:sessionId - 获取会话详情（含消息）
  app.get('/api/v1/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = store.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = store.getMessages(sessionId);
    return res.json({ ...session, messages });
  });

  // PUT /api/v1/sessions/:sessionId - 更新会话
  app.put('/api/v1/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const { title } = req.body;

    const session = store.updateSession(sessionId, { title });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json(session);
  });

  // DELETE /api/v1/sessions/:sessionId - 删除会话
  app.delete('/api/v1/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    // 从内存中移除活跃会话
    activeSessions.delete(sessionId);

    const success = store.deleteSession(sessionId);
    if (!success) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({ success: true });
  });

  // POST /api/v1/chat - Send message and get streaming response
  app.post('/api/v1/chat', async (req, res): Promise<void> => {
    try {
      const { message, sessionId } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Invalid message field' });
        return;
      }

      const session = await getOrCreateSession(sessionId, config);
      const promptId = uuidv4();

      // 保存用户消息到持久化存储
      const userMessage: StoredMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };
      store.addMessage(session.id, userMessage);

      // Set SSE response headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Send session ID and message ID
      res.write(
        `data: ${JSON.stringify({
          type: 'session',
          sessionId: session.id,
          workDir: session.workDir,
        })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ type: 'messageId', messageId: promptId })}\n\n`,
      );

      const abortController = new AbortController();
      req.on('close', () => {
        abortController.abort();
      });

      // 收集完整的 AI 响应
      let fullResponse = '';

      try {
        fullResponse = await processMessageWithToolLoop(
          session.task,
          message,
          promptId,
          abortController.signal,
          res,
          session.config,
        );

        // 保存 AI 响应到持久化存储
        if (fullResponse) {
          const assistantMessage: StoredMessage = {
            id: promptId,
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now(),
          };
          store.addMessage(session.id, assistantMessage);

          // 如果是第一条消息，更新会话标题
          const messages = store.getMessages(session.id);
          if (messages.length === 2) {
            // 1 user + 1 assistant
            const title = message.substring(0, 30);
            store.updateSession(session.id, { title });
          }
        }

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

  // POST /api/v1/tools/confirm - Confirm tool call (not used in YOLO mode)
  app.post('/api/v1/tools/confirm', async (req, res) => {
    try {
      const { toolCallId, confirmed, sessionId } = req.body;

      if (!toolCallId || typeof confirmed !== 'boolean') {
        return res.status(400).json({
          error: 'Invalid toolCallId or confirmed field',
        });
      }

      if (!sessionId || !activeSessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
      }

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

  // GET /api/v1/session/:sessionId - 获取会话信息（兼容旧 API）
  app.get('/api/v1/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({
      id: session.id,
      createdAt: session.createdAt,
    });
  });
}

/**
 * Process message with complete tool execution loop.
 * Returns the full response content.
 */
async function processMessageWithToolLoop(
  task: Task,
  message: string,
  promptId: string,
  signal: AbortSignal,
  res: express.Response,
  config: Config,
): Promise<string> {
  const MAX_TURNS = 50;
  let turnCount = 0;
  let currentRequest: Part[] = [{ text: message }];
  let fullContent = '';

  while (turnCount < MAX_TURNS) {
    turnCount++;

    if (signal.aborted) {
      logger.info('[ChatAPI] Request aborted by client');
      break;
    }

    logger.info(
      `[ChatAPI] Processing turn ${turnCount} for prompt ${promptId}`,
    );

    const stream = task.geminiClient.sendMessageStream(
      currentRequest,
      signal,
      promptId,
    );

    const toolCallRequests: ToolCallRequestInfo[] = [];

    for await (const event of stream) {
      if (signal.aborted) {
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: 'Request cancelled' })}\n\n`,
        );
        return fullContent;
      }

      if (event.type === GeminiEventType.Content) {
        const text = typeof event.value === 'string' ? event.value : '';
        if (text) {
          fullContent += text;
          res.write(
            `data: ${JSON.stringify({ type: 'text', content: text, messageId: promptId })}\n\n`,
          );
        }
      } else if (event.type === GeminiEventType.Thought) {
        const thoughtValue = event.value;
        res.write(
          `data: ${JSON.stringify({
            type: 'thought',
            thought: thoughtValue,
            messageId: promptId,
          })}\n\n`,
        );
      } else if (event.type === GeminiEventType.ToolCallRequest) {
        const toolCall = event.value;
        if (toolCall && typeof toolCall === 'object' && 'callId' in toolCall) {
          toolCallRequests.push(toolCall);
          res.write(
            `data: ${JSON.stringify({
              type: 'tool_call',
              toolCall: {
                id: toolCall.callId || uuidv4(),
                name: toolCall.name || 'unknown',
                args: toolCall.args || {},
                requiresConfirmation: false,
              },
            })}\n\n`,
          );
        }
      } else if (event.type === GeminiEventType.Error) {
        const errorValue = event.value as
          | { error?: { message?: string } }
          | undefined;
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: errorValue?.error?.message || 'Unknown error',
          })}\n\n`,
        );
        return fullContent;
      } else if (event.type === GeminiEventType.Finished) {
        break;
      }
    }

    if (toolCallRequests.length === 0) {
      logger.info('[ChatAPI] No tool calls, conversation turn complete');
      break;
    }

    logger.info(
      `[ChatAPI] Executing ${toolCallRequests.length} tool calls for turn ${turnCount}`,
    );

    const toolResponseParts: Part[] = [];

    for (const requestInfo of toolCallRequests) {
      try {
        res.write(
          `data: ${JSON.stringify({
            type: 'tool_executing',
            toolCallId: requestInfo.callId,
            name: requestInfo.name,
          })}\n\n`,
        );

        const completedToolCall = await executeToolCall(
          config,
          requestInfo,
          signal,
        );

        const toolResponse = completedToolCall.response;

        res.write(
          `data: ${JSON.stringify({
            type: 'tool_result',
            toolCallId: requestInfo.callId,
            name: requestInfo.name,
            success: !toolResponse.error,
            result:
              typeof toolResponse.resultDisplay === 'string'
                ? toolResponse.resultDisplay
                : undefined,
            error: toolResponse.error?.message,
          })}\n\n`,
        );

        if (toolResponse.responseParts) {
          toolResponseParts.push(...toolResponse.responseParts);
        }
      } catch (error) {
        logger.error(
          `[ChatAPI] Error executing tool ${requestInfo.name}:`,
          error,
        );
        const errorMessage =
          error instanceof Error ? error.message : 'Tool execution error';

        res.write(
          `data: ${JSON.stringify({
            type: 'tool_result',
            toolCallId: requestInfo.callId,
            name: requestInfo.name,
            success: false,
            error: errorMessage,
          })}\n\n`,
        );

        toolResponseParts.push({
          text: `Error executing tool ${requestInfo.name}: ${errorMessage}`,
        });
      }
    }

    if (toolResponseParts.length > 0) {
      currentRequest = toolResponseParts;
      logger.info(
        `[ChatAPI] Sending ${toolResponseParts.length} tool results to model for turn ${turnCount + 1}`,
      );
    } else {
      currentRequest = [
        {
          text: 'All tool calls failed. Please try a different approach.',
        },
      ];
    }
  }

  if (turnCount >= MAX_TURNS) {
    logger.warn(
      `[ChatAPI] Max turns (${MAX_TURNS}) reached for prompt ${promptId}`,
    );
    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        error: 'Maximum conversation turns reached',
      })}\n\n`,
    );
  }

  return fullContent;
}
