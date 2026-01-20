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
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  conversationId,
  onUpdateTitle,
  onAddMessage,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<ToolCall | null>(null);
  const [currentStreamingContent, setCurrentStreamingContent] = useState('');
  const [currentThoughts, setCurrentThoughts] = useState<ThoughtSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages for current conversation
  useEffect(() => {
    // Clear streaming state when switching conversations
    setCurrentStreamingContent('');
    setIsLoading(false);
    setPendingToolCall(null);

    if (conversationId) {
      const saved = localStorage.getItem(`gemini-messages-${conversationId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[];
        setMessages(parsed);
      } else {
        setMessages([]);
      }
      // Generate session ID from conversation ID
      setSessionId(conversationId.replace('conv-', 'session-'));
    } else {
      setMessages([]);
      setSessionId(null);
    }
  }, [conversationId]);

  // Save messages when they change
  useEffect(() => {
    if (conversationId && messages.length > 0) {
      localStorage.setItem(
        `gemini-messages-${conversationId}`,
        JSON.stringify(messages),
      );
      // Update conversation title from first user message
      if (messages.length > 0 && onUpdateTitle) {
        const firstUserMessage = messages.find((m) => m.role === 'user');
        if (firstUserMessage) {
          const title = firstUserMessage.content.substring(0, 30);
          onUpdateTitle(conversationId, title);
        }
      }
    }
  }, [messages, conversationId, onUpdateTitle]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStreamingContent]);

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

    // Use refs to track streaming content to avoid closure issues
    let streamingMessageId: string | null = null;
    let streamingContent = '';

    try {
      const handleStream = (event: StreamEvent) => {
        if (event.type === 'text') {
          const data = event.data as { content?: string; messageId?: string };
          const { content, messageId } = data;
          if (messageId) {
            streamingMessageId = messageId;
          }
          if (content) {
            streamingContent += content;
            setCurrentStreamingContent(streamingContent);
          }
        } else if (event.type === 'thought') {
          // 思考过程事件
          const data = event.data as { thought?: ThoughtSummary };
          if (data.thought) {
            setCurrentThoughts((prev) => [...prev, data.thought!]);
          }
        } else if (event.type === 'tool_call') {
          const toolCall = event.data as ToolCall;
          // 只有在需要确认时才设置 pendingToolCall
          // YOLO mode: 如果 requiresConfirmation 为 false，则继续处理，不暂停
          if (toolCall.requiresConfirmation) {
            setPendingToolCall(toolCall);
            setIsLoading(false);
          }
          // YOLO mode: 如果不需要确认，工具会自动执行，继续处理流式响应
        } else if (event.type === 'tool_result') {
          // 工具执行结果，继续处理流式响应
          // 可以选择显示工具执行结果，但不中断流式显示
          console.log('Tool result:', event.data);
        } else if (event.type === 'done') {
          // Use the refs values instead of state values to avoid closure issues
          if (streamingMessageId && streamingContent) {
            const assistantMessage: ChatMessage = {
              id: streamingMessageId,
              role: 'assistant',
              content: streamingContent,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
          // 清空流式状态
          setCurrentStreamingContent('');
          setCurrentThoughts([]);
          setIsLoading(false);
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
    }
  };

  const handleToolConfirm = async (confirmed: boolean) => {
    if (!pendingToolCall) return;

    try {
      await apiClient.confirmToolCall(pendingToolCall.id, confirmed);
      setPendingToolCall(null);
      setIsLoading(true);
      // 继续处理工具调用后的响应
    } catch (error) {
      console.error('Failed to confirm tool call:', error);
      setPendingToolCall(null);
    }
  };

  if (!conversationId) {
    return (
      <div className="chat-interface empty">
        <div className="empty-state">
          <div className="empty-icon">G</div>
          <h2>今天有什么可以帮到你?</h2>
          <p>选择一个对话或创建新对话开始</p>
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
