/* eslint-disable */
import type { ChatMessage } from '../types';
import './Message.css';

interface MessageProps {
  message: ChatMessage;
}

const Message: React.FC<MessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-header">
        <span className="message-role">{isUser ? '你' : 'Gemini'}</span>
        <span className="message-time">
          {new Date(message.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="message-content">
        {message.isStreaming ? (
          <>
            {message.content}
            <span className="message-cursor">▋</span>
          </>
        ) : (
          <pre className="message-text">{message.content}</pre>
        )}
      </div>
    </div>
  );
};

export default Message;
