/* eslint-disable */
import Message from './Message';
import type { ChatMessage, ThoughtSummary } from '../types';
import './MessageList.css';

interface MessageListProps {
  messages: ChatMessage[];
  streamingContent?: string;
  streamingThoughts?: ThoughtSummary[];
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  streamingContent,
  streamingThoughts,
}) => {
  return (
    <div className="message-list">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {(streamingContent || streamingThoughts) && (
        <Message
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingContent || '',
            timestamp: Date.now(),
            isStreaming: true,
          }}
          thoughts={streamingThoughts}
        />
      )}
    </div>
  );
};

export default MessageList;
