/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SessionMetadata {
  id: string;
  title: string;
  workDir: string; // 相对于 baseDir 的目录名
  createdAt: number;
  updatedAt: number;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface SessionsIndex {
  [sessionId: string]: SessionMetadata;
}

export class SessionStore {
  private sessionsDir: string; // sessions 目录（存储元数据和消息）
  private projectsDir: string; // projects 目录（工作目录）
  private indexPath: string;
  private index: SessionsIndex;

  constructor(sessionsDir: string, projectsDir: string) {
    this.sessionsDir = sessionsDir;
    this.projectsDir = projectsDir;
    this.indexPath = path.join(sessionsDir, '.sessions.json');

    // 确保 sessions 目录存在
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    this.index = this.loadIndex();
  }

  private loadIndex(): SessionsIndex {
    if (fs.existsSync(this.indexPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
      } catch {
        return {};
      }
    }
    return {};
  }

  private saveIndex(): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2));
  }

  // 获取所有会话（按更新时间倒序）
  listSessions(): SessionMetadata[] {
    return Object.values(this.index).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // 获取单个会话
  getSession(sessionId: string): SessionMetadata | null {
    return this.index[sessionId] || null;
  }

  // 获取会话的绝对工作目录路径（在 projects 目录下）
  getWorkDirPath(sessionId: string): string | null {
    const session = this.index[sessionId];
    if (!session) return null;
    return path.join(this.projectsDir, session.workDir);
  }

  // 创建会话
  createSession(
    sessionId: string,
    workDirName: string,
    title: string = '新对话',
  ): SessionMetadata {
    // 工作目录在 projects 目录下
    const workDirPath = path.join(this.projectsDir, workDirName);
    if (!fs.existsSync(workDirPath)) {
      fs.mkdirSync(workDirPath, { recursive: true });
    }

    // 消息目录在 sessions 目录下
    const sessionMessagesDir = path.join(this.sessionsDir, sessionId);
    if (!fs.existsSync(sessionMessagesDir)) {
      fs.mkdirSync(sessionMessagesDir, { recursive: true });
    }

    const session: SessionMetadata = {
      id: sessionId,
      title,
      workDir: workDirName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.index[sessionId] = session;
    this.saveIndex();

    // 初始化空消息文件（在 sessions 目录下）
    const messagesPath = path.join(sessionMessagesDir, '.messages.json');
    if (!fs.existsSync(messagesPath)) {
      fs.writeFileSync(messagesPath, '[]');
    }

    // 在工作目录中创建空的 index.html 模板
    const indexHtmlPath = path.join(workDirPath, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      const htmlTemplate = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    
</body>
</html>`;
      fs.writeFileSync(indexHtmlPath, htmlTemplate, 'utf-8');
    }

    return session;
  }

  // 更新会话
  updateSession(
    sessionId: string,
    updates: Partial<Pick<SessionMetadata, 'title'>>,
  ): SessionMetadata | null {
    const session = this.index[sessionId];
    if (!session) return null;

    if (updates.title !== undefined) {
      session.title = updates.title;
    }
    session.updatedAt = Date.now();

    this.index[sessionId] = session;
    this.saveIndex();

    return session;
  }

  // 删除会话
  deleteSession(sessionId: string): boolean {
    const session = this.index[sessionId];
    if (!session) return false;

    // 删除工作目录（projects 目录下）
    const workDirPath = path.join(this.projectsDir, session.workDir);
    if (fs.existsSync(workDirPath)) {
      fs.rmSync(workDirPath, { recursive: true, force: true });
    }

    // 删除消息目录（sessions 目录下）
    const sessionMessagesDir = path.join(this.sessionsDir, sessionId);
    if (fs.existsSync(sessionMessagesDir)) {
      fs.rmSync(sessionMessagesDir, { recursive: true, force: true });
    }

    delete this.index[sessionId];
    this.saveIndex();

    return true;
  }

  // 获取消息（从 sessions 目录）
  getMessages(sessionId: string): StoredMessage[] {
    const sessionMessagesDir = path.join(this.sessionsDir, sessionId);
    const messagesPath = path.join(sessionMessagesDir, '.messages.json');
    if (fs.existsSync(messagesPath)) {
      try {
        return JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
      } catch {
        return [];
      }
    }
    return [];
  }

  // 添加消息（保存到 sessions 目录）
  addMessage(sessionId: string, message: StoredMessage): boolean {
    const sessionMessagesDir = path.join(this.sessionsDir, sessionId);
    if (!fs.existsSync(sessionMessagesDir)) {
      fs.mkdirSync(sessionMessagesDir, { recursive: true });
    }

    const messages = this.getMessages(sessionId);
    messages.push(message);

    const messagesPath = path.join(sessionMessagesDir, '.messages.json');
    fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));

    // 更新会话时间
    this.updateSession(sessionId, {});

    return true;
  }

  // 检查会话是否存在
  hasSession(sessionId: string): boolean {
    return sessionId in this.index;
  }
}

// 单例
let storeInstance: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!storeInstance) {
    throw new Error(
      'SessionStore not initialized. Call initSessionStore() first.',
    );
  }
  return storeInstance;
}

export function initSessionStore(
  sessionsDir: string,
  projectsDir: string,
): SessionStore {
  storeInstance = new SessionStore(sessionsDir, projectsDir);
  return storeInstance;
}
