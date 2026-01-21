/* eslint-disable */
import { useState, useRef, useEffect, useCallback } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ToolConfirmation from './ToolConfirmation';
import { apiClient } from '../services/api';
import type {
  ChatMessage,
  StreamEvent,
  ToolCall,
  ThoughtSummary,
  Attachment,
} from '../types';
import './ChatInterface.css';

interface ChatInterfaceProps {
  conversationId: string | null;
  onUpdateTitle?: (id: string, title: string) => void;
  onAddMessage?: () => void;
  onSessionCreated?: (sessionId: string, workDir: string) => void;
  onMessageComplete?: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  conversationId,
  onUpdateTitle,
  onAddMessage,
  onSessionCreated,
  onMessageComplete,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<ToolCall | null>(null);
  const [currentStreamingContent, setCurrentStreamingContent] = useState('');
  const [currentThoughts, setCurrentThoughts] = useState<ThoughtSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevConversationIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // 从后端加载消息
  useEffect(() => {
    const prevConversationId = prevConversationIdRef.current;
    prevConversationIdRef.current = conversationId;

    // 关键修复：新会话在发送中被创建时（conversationId 从 null 变成新 id），
    // 如果正在加载中，不要清空流式状态和重载消息，否则会导致等待状态消失
    const isCreatingSessionDuringSend =
      prevConversationId === null && conversationId && isLoadingRef.current;

    if (!isCreatingSessionDuringSend) {
      setCurrentStreamingContent('');
      setIsLoading(false);
      setPendingToolCall(null);
    }

    if (conversationId) {
      setSessionId(conversationId);
      if (!isCreatingSessionDuringSend) {
        setIsLoadingMessages(true);
        apiClient
          .getSession(conversationId)
          .then((session) => {
            setMessages(session.messages || []);
          })
          .catch((error) => {
            console.error('Failed to load messages:', error);
            setMessages([]);
          })
          .finally(() => {
            setIsLoadingMessages(false);
          });
      }
    } else {
      setMessages([]);
      setSessionId(null);
    }
  }, [conversationId]);

  const scrollToBottom = useCallback((immediate = false) => {
    // 清除之前的定时器
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // 直接操作滚动容器，更可靠
    const scroll = () => {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    };

    if (immediate) {
      // 使用多个 setTimeout 确保 DOM 已完全更新
      setTimeout(() => {
        scroll();
        // 再次滚动以确保
        setTimeout(scroll, 50);
      }, 0);
    } else {
      scrollTimeoutRef.current = setTimeout(scroll, 50);
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStreamingContent, currentThoughts, scrollToBottom]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleSendMessage = async (
    content: string,
    attachments?: Attachment[],
  ) => {
    // 允许只有附件没有文本
    if (
      (!content.trim() && (!attachments || attachments.length === 0)) ||
      isLoading
    )
      return;

    // 构建用户消息显示内容（包含附件信息）
    let displayContent = content.trim();
    if (attachments && attachments.length > 0) {
      const attachmentInfo = attachments.map((a) => `[${a.name}]`).join(' ');
      displayContent = displayContent
        ? `${attachmentInfo}\n${displayContent}`
        : attachmentInfo;
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: displayContent,
      timestamp: Date.now(),
      attachments, // 保存附件信息用于显示
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    // 立即触发 streaming UI（点点点），避免依赖后端首包是否被缓冲
    // 注意：最终落库的 assistant 内容来自 streamingContent 变量，不会包含这里的占位空格
    setCurrentStreamingContent(' ');
    setCurrentThoughts([]);

    // 用户发送消息后立即滚动到底部
    scrollToBottom(true);

    let streamingMessageId: string | null = null;
    let streamingContent = '';
    let isFirstMessage = messages.length === 0;
    let newSessionId: string | null = null; // 用于跟踪新创建的 sessionId

    try {
      const handleStream = (event: StreamEvent) => {
        if (event.type === 'session') {
          // 新会话创建事件
          const data = event.data as { sessionId?: string; workDir?: string };
          if (data.sessionId && data.workDir) {
            newSessionId = data.sessionId; // 保存新的 sessionId
            setSessionId(data.sessionId);
            if (!conversationId) {
              // 这是一个新会话
              onSessionCreated?.(data.sessionId, data.workDir);
            }
          }
        } else if (event.type === 'text') {
          const data = event.data as { content?: string; messageId?: string };
          const { content: textContent, messageId } = data;
          if (messageId) {
            streamingMessageId = messageId;
          }
          if (textContent) {
            streamingContent += textContent;
            setCurrentStreamingContent(streamingContent);
            // 流式内容更新时也滚动到底部（使用节流，避免过于频繁）
            scrollToBottom();
          }
        } else if (event.type === 'thought') {
          const data = event.data as { thought?: ThoughtSummary };
          if (data.thought) {
            setCurrentThoughts((prev) => [...prev, data.thought!]);
            // 思考更新时也滚动到底部（使用立即滚动）
            scrollToBottom(true);
          }
        } else if (event.type === 'tool_call') {
          const toolCall = event.data as ToolCall;
          if (toolCall.requiresConfirmation) {
            setPendingToolCall(toolCall);
            setIsLoading(false);
          }
        } else if (event.type === 'tool_result') {
          console.log('Tool result:', event.data);
        } else if (event.type === 'done') {
          if (streamingMessageId && streamingContent) {
            const assistantMessage: ChatMessage = {
              id: streamingMessageId,
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistantMessage]);

            // 更新标题（如果是第一条消息）
            // 使用 newSessionId（新创建的会话）或 sessionId（已有的会话）
            const currentSessionId = newSessionId || sessionId;
            if (isFirstMessage && currentSessionId) {
              const title = content.substring(0, 30);
              onUpdateTitle?.(currentSessionId, title);
            }

            // AI 回复完成后滚动到底部
            scrollToBottom(true);
          }
          setCurrentStreamingContent('');
          setCurrentThoughts([]);
          setIsLoading(false);
          // AI 回复完成后触发重新加载
          onMessageComplete?.();
        } else if (event.type === 'error') {
          console.error('Stream error:', event.data);
          setCurrentStreamingContent('');
          setCurrentThoughts([]);
          setIsLoading(false);
        }
      };

      // 发送消息（带附件）
      await apiClient.sendMessage(
        content,
        sessionId || undefined,
        handleStream,
        attachments,
      );
      onAddMessage?.();
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsLoading(false);
      // 错误消息添加后也滚动到底部
      scrollToBottom(true);
    }
  };

  const handleToolConfirm = async (confirmed: boolean) => {
    if (!pendingToolCall) return;

    try {
      await apiClient.confirmToolCall(pendingToolCall.id, confirmed);
      setPendingToolCall(null);
      setIsLoading(true);
    } catch (error) {
      console.error('Failed to confirm tool call:', error);
      setPendingToolCall(null);
    }
  };

  // 新对话状态
  if (!conversationId && messages.length === 0) {
    return (
      <div className="chat-interface">
        <div className="chat-messages">
          <div className="empty-chat">
            <div className="empty-icon">G</div>
            <h2>今天有什么可以帮到你?</h2>
            <p>开始一个新对话</p>
          </div>
        </div>
        <MessageInput
          onSend={handleSendMessage}
          disabled={isLoading || !!pendingToolCall}
        />
      </div>
    );
  }

  if (isLoadingMessages) {
    return (
      <div className="chat-interface">
        <div className="chat-messages">
          <div className="loading-messages">加载消息中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="chat-messages" ref={messagesContainerRef}>
        {messages.length === 0 && !isLoading ? (
          <div className="empty-chat">
            <div className="empty-icon">G</div>
            <h2>今天有什么可以帮到你?</h2>
          </div>
        ) : (
          <MessageList
            messages={messages}
            streamingContent={currentStreamingContent || undefined}
            streamingThoughts={
              currentThoughts.length > 0 ? currentThoughts : undefined
            }
          />
        )}
        <div ref={messagesEndRef} />
      </div>
      {pendingToolCall && (
        <ToolConfirmation
          toolCall={pendingToolCall}
          onConfirm={handleToolConfirm}
        />
      )}
      <MessageInput
        onSend={handleSendMessage}
        disabled={isLoading || !!pendingToolCall}
      />
    </div>
  );
};

export default ChatInterface;
