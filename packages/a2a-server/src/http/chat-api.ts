/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  Config,
  ToolCallRequestInfo,
  GeminiCLIExtension,
  ConversationRecord,
  ResumedSessionData,
} from '@google/gemini-cli-core';
import { getProjectHash } from '@google/gemini-cli-core';
import { SimpleExtensionLoader } from '@google/gemini-cli-core';
import { GeminiEventType, executeToolCall } from '@google/gemini-cli-core';
import type { Part } from '@google/genai';
import { logger } from '../utils/logger.js';
import { Task } from '../agent/task.js';
import {
  createSessionConfig,
  generateRandomId,
  getSessionsBaseDir,
} from '../config/config.js';
import type { Settings } from '../config/settings.js';
import {
  getSessionStore,
  type StoredMessage,
} from '../storage/session-store.js';
import { convertToClientHistory } from '../utils/historyConverter.js';

/**
 * 从 MIME 类型获取文件扩展名
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    // 图片
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    // 视频
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    // 音频
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/webm': '.weba',
    'audio/x-m4a': '.m4a',
    // 文档
    'application/pdf': '.pdf',
  };

  return mimeToExt[mimeType] || '.bin';
}

/**
 * 保存多模态文件到会话工作目录
 * @param inlineData - 包含 base64 数据和 mimeType 的对象
 * @param workDir - 会话工作目录的完整路径
 * @returns 保存的文件路径（相对于工作目录）
 */
function saveMultimodalFile(
  inlineData: { data: string; mimeType: string },
  workDir: string,
): string {
  try {
    // 确保工作目录存在
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    // 生成唯一文件名
    const extension = getExtensionFromMimeType(inlineData.mimeType);
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const fileName = `upload_${timestamp}_${randomId}${extension}`;
    const filePath = path.join(workDir, fileName);

    // 解码 base64 数据
    const buffer = Buffer.from(inlineData.data, 'base64');

    // 保存文件
    fs.writeFileSync(filePath, buffer);

    logger.info(
      `[ChatAPI] Saved multimodal file: ${fileName} (${(buffer.length / 1024).toFixed(2)} KB) to ${workDir}`,
    );

    return fileName; // 返回相对路径
  } catch (error) {
    logger.error('[ChatAPI] Error saving multimodal file:', error);
    throw error;
  }
}

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

    // 尝试恢复对话历史
    let resumedSessionData: ResumedSessionData | undefined;
    if (storedSession.conversationFilePath) {
      try {
        if (fs.existsSync(storedSession.conversationFilePath)) {
          const conversationData = fs.readFileSync(
            storedSession.conversationFilePath,
            'utf-8',
          );
          const conversation: ConversationRecord = JSON.parse(conversationData);

          resumedSessionData = {
            conversation,
            filePath: storedSession.conversationFilePath,
          };

          // 转换历史记录并恢复到 Gemini 客户端
          const clientHistory = convertToClientHistory(conversation.messages);
          await task.geminiClient.resumeChat(clientHistory, resumedSessionData);

          logger.info(
            `[ChatAPI] Successfully restored ${clientHistory.length} history entries for session ${sessionId}`,
          );
        } else {
          logger.warn(
            `[ChatAPI] Conversation file not found: ${storedSession.conversationFilePath}`,
          );
        }
      } catch (error) {
        logger.error(`[ChatAPI] Error restoring conversation history:`, error);
        // 继续使用空历史，不中断会话恢复
      }
    }

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

  // 创建对话历史文件路径（统一存储在 user_data/sessions 目录）
  const sessionsDir = getSessionsBaseDir();
  const sessionDir = path.join(sessionsDir, newSessionId);
  const conversationFilePath = path.join(sessionDir, 'conversation.json');

  // 确保会话目录存在
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // 创建空的对话记录文件
  const emptyConversation: ConversationRecord = {
    sessionId: newSessionId,
    projectHash: getProjectHash(config.getProjectRoot()),
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    messages: [],
  };
  fs.writeFileSync(
    conversationFilePath,
    JSON.stringify(emptyConversation, null, 2),
  );

  // 创建 ResumedSessionData 指向统一存储位置
  const resumedSessionData: ResumedSessionData = {
    conversation: emptyConversation,
    filePath: conversationFilePath,
  };

  // 保存对话文件路径到 SessionStore
  store.updateSession(newSessionId, { conversationFilePath });

  const contextId = uuidv4();
  const task = await Task.create(
    newSessionId,
    contextId,
    config,
    undefined,
    true,
  );

  // 使用 resumeChat 初始化，这样 ChatRecordingService 会使用我们指定的文件路径
  await task.geminiClient.resumeChat([], resumedSessionData);

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

  // JSON 解析器（普通大小限制，用于非多模态路由）
  const jsonParser = express.json();

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
  // 需要 jsonParser 来解析 req.body
  app.put('/api/v1/sessions/:sessionId', jsonParser, (req, res) => {
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
  // 支持多模态：可以发送 message (string) 或 parts (Part[])
  // 为多模态请求配置更大的请求体限制（图片/视频的 base64 编码可能很大）
  const largeBodyParser = express.json({ limit: '100mb' });
  app.post('/api/v1/chat', largeBodyParser, async (req, res): Promise<void> => {
    try {
      const { message, sessionId, parts } = req.body;

      // 验证输入：至少需要 message 或 parts
      if (!message && (!parts || !Array.isArray(parts) || parts.length === 0)) {
        res
          .status(400)
          .json({ error: 'Invalid request: message or parts required' });
        return;
      }

      // 如果提供了 message，确保它是字符串
      if (message && typeof message !== 'string') {
        res
          .status(400)
          .json({ error: 'Invalid message field: must be a string' });
        return;
      }

      const session = await getOrCreateSession(sessionId, config);
      const promptId = uuidv4();

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
        // 构建请求 parts：如果有 parts 直接使用，否则用 message 构建
        const requestParts: Part[] =
          parts && Array.isArray(parts) && parts.length > 0
            ? parts
            : [{ text: message }];

        // 保存多模态文件到工作目录，并为每个文件添加名称标识
        const savedFiles: string[] = [];
        const workDirPath = store.getWorkDirPath(session.id);
        const enhancedParts: Part[] = [];

        if (workDirPath && requestParts.length > 0) {
          for (const part of requestParts) {
            if (part && typeof part === 'object' && 'inlineData' in part) {
              try {
                const fileName = saveMultimodalFile(
                  part.inlineData as { data: string; mimeType: string },
                  workDirPath,
                );
                savedFiles.push(fileName);

                // 在多模态内容前添加文件名标识，让 AI 知道文件名
                enhancedParts.push({
                  text: `[Uploaded file: ${fileName}]`,
                });
                enhancedParts.push(part);

                logger.info(
                  `[ChatAPI] Saved multimodal file for session ${session.id}: ${fileName}`,
                );
              } catch (error) {
                logger.error(
                  `[ChatAPI] Failed to save multimodal file:`,
                  error,
                );
                // 保存失败时仍然传递原始内容给 AI
                enhancedParts.push(part);
              }
            } else {
              // 非多模态内容直接添加
              enhancedParts.push(part);
            }
          }
        } else {
          // 如果没有工作目录，直接使用原始 parts
          enhancedParts.push(...requestParts);
        }

        // 如果有文件被保存，记录到日志
        if (savedFiles.length > 0) {
          logger.info(
            `[ChatAPI] Saved ${savedFiles.length} multimodal file(s) to ${workDirPath}`,
          );
        }

        // 使用增强后的 parts（包含文件名信息）
        const finalRequestParts = enhancedParts;

        // 构建用户消息内容（包含文件信息）
        let userMessageContent = message || '';
        if (savedFiles.length > 0) {
          const fileList = savedFiles.map((f) => `@${f}`).join(' ');
          userMessageContent = userMessageContent
            ? `${fileList}\n${userMessageContent}`
            : fileList;
        }

        // 保存用户消息到持久化存储
        const userMessage: StoredMessage = {
          id: `user-${Date.now()}`,
          role: 'user',
          content: userMessageContent,
          timestamp: Date.now(),
        };
        store.addMessage(session.id, userMessage);

        fullResponse = await processMessageWithToolLoop(
          session.task,
          finalRequestParts,
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

          // 保存 ChatRecordingService 的对话文件路径
          // 这样下次恢复会话时可以加载完整的对话历史
          const chatRecordingService =
            session.task.geminiClient.getChatRecordingService();
          const conversationFilePath =
            chatRecordingService?.getConversationFilePath();
          if (conversationFilePath) {
            store.updateSession(session.id, { conversationFilePath });
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
  // 需要 jsonParser 来解析 req.body
  app.post('/api/v1/tools/confirm', jsonParser, async (req, res) => {
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
 * Supports multimodal input (text, images, video, audio, PDF).
 * Returns the full response content.
 */
async function processMessageWithToolLoop(
  task: Task,
  messageParts: Part[],
  promptId: string,
  signal: AbortSignal,
  res: express.Response,
  config: Config,
): Promise<string> {
  const MAX_TURNS = 50;
  let turnCount = 0;
  // 直接使用传入的 parts（可能包含多模态内容）
  let currentRequest: Part[] = messageParts;
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
        // 注意：不要在这里 break！
        // 需要让 generator 完全消费完毕，这样 processStreamResponse 中
        // 记录模型响应的代码才会执行
        logger.info(
          '[ChatAPI] Received Finished event, continuing to drain stream',
        );
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
