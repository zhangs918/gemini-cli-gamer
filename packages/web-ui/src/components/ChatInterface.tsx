/* eslint-disable */
import { useState, useRef, useEffect } from 'react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ToolConfirmation from './ToolConfirmation';
import { apiClient } from '../services/api';
import type { ChatMessage, StreamEvent, ToolCall } from '../types';
import './ChatInterface.css';

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<ToolCall | null>(null);
  const [currentStreamingContent, setCurrentStreamingContent] = useState('');
  const [currentStreamingId, setCurrentStreamingId] = useState<string | null>(
    null,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    setCurrentStreamingId(null);

    try {
      const handleStream = (event: StreamEvent) => {
        if (event.type === 'text') {
          const { content, messageId } = event.data;
          setCurrentStreamingId(messageId);
          setCurrentStreamingContent((prev) => prev + (content || ''));
        } else if (event.type === 'tool_call') {
          const toolCall = event.data as ToolCall;
          setPendingToolCall(toolCall);
          setIsLoading(false);
        } else if (event.type === 'done') {
          if (currentStreamingId && currentStreamingContent) {
            const assistantMessage: ChatMessage = {
              id: currentStreamingId,
              role: 'assistant',
              content: currentStreamingContent,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
            setCurrentStreamingContent('');
            setCurrentStreamingId(null);
          }
          setIsLoading(false);
        } else if (event.type === 'error') {
          console.error('Stream error:', event.data);
          setIsLoading(false);
        }
      };

      await apiClient.sendMessage(content, undefined, handleStream);
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

  return (
    <div className="chat-interface">
      <div className="chat-messages">
        <MessageList
          messages={messages}
          streamingContent={
            currentStreamingContent && currentStreamingId
              ? currentStreamingContent
              : undefined
          }
        />
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
