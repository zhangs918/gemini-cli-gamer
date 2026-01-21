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
  private baseDir: string;
  private indexPath: string;
  private index: SessionsIndex;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.indexPath = path.join(baseDir, '.sessions.json');

    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
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

  // 获取会话的绝对工作目录路径
  getWorkDirPath(sessionId: string): string | null {
    const session = this.index[sessionId];
    if (!session) return null;
    return path.join(this.baseDir, session.workDir);
  }

  // 创建会话
  createSession(
    sessionId: string,
    workDirName: string,
    title: string = '新对话',
  ): SessionMetadata {
    const workDirPath = path.join(this.baseDir, workDirName);

    // 确保工作目录存在
    if (!fs.existsSync(workDirPath)) {
      fs.mkdirSync(workDirPath, { recursive: true });
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

    // 初始化空消息文件
    const messagesPath = path.join(workDirPath, '.messages.json');
    if (!fs.existsSync(messagesPath)) {
      fs.writeFileSync(messagesPath, '[]');
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

    const workDirPath = path.join(this.baseDir, session.workDir);

    // 删除工作目录
    if (fs.existsSync(workDirPath)) {
      fs.rmSync(workDirPath, { recursive: true, force: true });
    }

    delete this.index[sessionId];
    this.saveIndex();

    return true;
  }

  // 获取消息
  getMessages(sessionId: string): StoredMessage[] {
    const workDirPath = this.getWorkDirPath(sessionId);
    if (!workDirPath) return [];

    const messagesPath = path.join(workDirPath, '.messages.json');
    if (fs.existsSync(messagesPath)) {
      try {
        return JSON.parse(fs.readFileSync(messagesPath, 'utf-8'));
      } catch {
        return [];
      }
    }
    return [];
  }

  // 添加消息
  addMessage(sessionId: string, message: StoredMessage): boolean {
    const workDirPath = this.getWorkDirPath(sessionId);
    if (!workDirPath) return false;

    const messages = this.getMessages(sessionId);
    messages.push(message);

    const messagesPath = path.join(workDirPath, '.messages.json');
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

export function getSessionStore(baseDir?: string): SessionStore {
  if (!storeInstance) {
    if (!baseDir) {
      throw new Error('SessionStore not initialized. Call with baseDir first.');
    }
    storeInstance = new SessionStore(baseDir);
  }
  return storeInstance;
}

export function initSessionStore(baseDir: string): SessionStore {
  storeInstance = new SessionStore(baseDir);
  return storeInstance;
}
