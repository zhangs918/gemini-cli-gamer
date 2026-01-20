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
        <span className="message-role">{isUser ? '你' : 'Gemini CLI'}</span>
        <span className="message-time">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      <div className="message-bubble">
        <div className="message-content">
          {message.isStreaming ? (
            <>
              {message.content}
              <span className="message-cursor">▋</span>
            </>
          ) : (
            <div className="message-text">{message.content}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Message;
