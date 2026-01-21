/* eslint-disable */
import { useState, useRef, useEffect } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ToolConfirmation from './ToolConfirmation';
import { apiClient } from '../services/api';
import type {
  ChatMessage,
  StreamEvent,
  ToolCall,
  ThoughtSummary,
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
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 从后端加载消息
  useEffect(() => {
    setCurrentStreamingContent('');
    setIsLoading(false);
    setPendingToolCall(null);

    if (conversationId) {
      setSessionId(conversationId);
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
    } else {
      setMessages([]);
      setSessionId(null);
    }
  }, [conversationId]);

  const scrollToBottom = (immediate = false) => {
    // 清除之前的定时器
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // 使用 requestAnimationFrame 确保 DOM 更新完成后再滚动
    const scroll = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    if (immediate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(scroll);
      });
    } else {
      scrollTimeoutRef.current = setTimeout(() => {
        requestAnimationFrame(scroll);
      }, 50);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStreamingContent]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setCurrentStreamingContent('');
    setCurrentThoughts([]);

    // 用户发送消息后立即滚动到底部
    scrollToBottom(true);

    let streamingMessageId: string | null = null;
    let streamingContent = '';
    let isFirstMessage = messages.length === 0;

    try {
      const handleStream = (event: StreamEvent) => {
        if (event.type === 'session') {
          // 新会话创建事件
          const data = event.data as { sessionId?: string; workDir?: string };
          if (data.sessionId && data.workDir) {
            setSessionId(data.sessionId);
            if (!conversationId) {
              // 这是一个新会话
              onSessionCreated?.(data.sessionId, data.workDir);
            }
          }
        } else if (event.type === 'text') {
          const data = event.data as { content?: string; messageId?: string };
          const { content, messageId } = data;
          if (messageId) {
            streamingMessageId = messageId;
          }
          if (content) {
            streamingContent += content;
            setCurrentStreamingContent(streamingContent);
            // 流式内容更新时也滚动到底部（使用节流，避免过于频繁）
            scrollToBottom();
          }
        } else if (event.type === 'thought') {
          const data = event.data as { thought?: ThoughtSummary };
          if (data.thought) {
            setCurrentThoughts((prev) => [...prev, data.thought!]);
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
            if (isFirstMessage && sessionId) {
              const title = content.substring(0, 30);
              onUpdateTitle?.(sessionId, title);
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
          setIsLoading(false);
        }
      };

      await apiClient.sendMessage(
        content,
        sessionId || undefined,
        handleStream,
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
      <div className="chat-messages">
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
