/* eslint-disable */
import Message from './Message';
import type { ChatMessage } from '../types';
import './MessageList.css';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent?: string;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  streamingContent,
}) => {
  return (
    <div className="message-list">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {streamingContent && (
        <Message
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingContent,
            timestamp: Date.now(),
            isStreaming: true,
          }}
        />
      )}
    </div>
  );
};

export default MessageList;
