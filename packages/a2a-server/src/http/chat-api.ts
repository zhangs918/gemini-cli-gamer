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
import { createSessionWorkDir, createSessionConfig } from '../config/config.js';
import type { Settings } from '../config/settings.js';

interface ChatSession {
  id: string;
  task: Task;
  config: Config;
  workDir: string;
  createdAt: number;
}

// 简单的内存会话存储（生产环境应使用 Redis 等）
const sessions = new Map<string, ChatSession>();

// 会话创建所需的上下文
interface SessionContext {
  settings: Settings;
  extensions: GeminiCLIExtension[]; // 存储 extensions 数组，而不是 ExtensionLoader 实例
  baseConfig: Config; // 用于获取认证等信息
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
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    // 检查会话是否过期（24小时）
    if (Date.now() - session.createdAt < 24 * 60 * 60 * 1000) {
      return session;
    }
    sessions.delete(sessionId);
  }

  const newSessionId = sessionId || uuidv4();
  const contextId = uuidv4();

  // 为新会话创建专用工作目录
  const workDir = createSessionWorkDir();
  logger.info(
    `[ChatAPI] New session ${newSessionId} using work directory: ${workDir}`,
  );

  // 为会话创建独立的 Config
  if (!sessionContext) {
    throw new Error(
      '[ChatAPI] Session context not set. This should not happen. Please ensure setSessionContext() is called during app initialization.',
    );
  }

  // 为每个会话创建独立的 ExtensionLoader 实例
  // 因为 ExtensionLoader.start() 只能调用一次，每个 Config 需要独立的实例
  const sessionExtensionLoader = new SimpleExtensionLoader(
    sessionContext.extensions,
  );

  const config = await createSessionConfig(
    sessionContext.settings,
    sessionExtensionLoader,
    newSessionId,
    workDir,
  );

  // Use Task class to handle complete tool execution loop
  const task = await Task.create(
    newSessionId,
    contextId,
    config,
    undefined, // No eventBus for chat API
    true, // autoExecute: tools run automatically in YOLO mode
  );

  await task.geminiClient.initialize();

  const session: ChatSession = {
    id: newSessionId,
    task,
    config,
    workDir,
    createdAt: Date.now(),
  };
  sessions.set(newSessionId, session);
  return session;
}

export function setupChatRoutes(app: express.Express, config: Config): void {
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

      // Set SSE response headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Send initial message ID
      res.write(
        `data: ${JSON.stringify({ type: 'messageId', messageId: promptId })}\n\n`,
      );

      const abortController = new AbortController();
      req.on('close', () => {
        abortController.abort();
      });

      try {
        // Process message with complete tool execution loop
        await processMessageWithToolLoop(
          session.task,
          message,
          promptId,
          abortController.signal,
          res,
          config,
        );

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

      if (!sessionId || !sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Tool confirmation is not needed in YOLO mode
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

/**
 * Process message with complete tool execution loop.
 * Reuses the pattern from gemini-cli's nonInteractiveCli and CoderAgentExecutor.
 */
async function processMessageWithToolLoop(
  task: Task,
  message: string,
  promptId: string,
  signal: AbortSignal,
  res: express.Response,
  config: Config,
): Promise<void> {
  const MAX_TURNS = 50; // Prevent infinite loops
  let turnCount = 0;
  let currentRequest: Part[] = [{ text: message }];

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
        return;
      }

      if (event.type === GeminiEventType.Content) {
        const text = typeof event.value === 'string' ? event.value : '';
        if (text) {
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
        return;
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

    // Send tool results back to model for next turn
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
}
