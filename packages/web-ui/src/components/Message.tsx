/* eslint-disable */
import type { ChatMessage, ThoughtSummary } from '../types';
import './Message.css';

interface MessageProps {
  message: ChatMessage;
  thoughts?: ThoughtSummary[];
}

const Message: React.FC<MessageProps> = ({ message, thoughts }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-header">
        <span className="message-role">{isUser ? '你' : 'Gemini CLI'}</span>
        {message.isStreaming && (
          <span className="message-streaming-indicator">
            <span className="streaming-dot"></span>
            <span className="streaming-dot"></span>
            <span className="streaming-dot"></span>
          </span>
        )}
        <span className="message-time">
          {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {thoughts && thoughts.length > 0 && (
        <div className="message-thoughts">
          {thoughts.map((thought, index) => (
            <div key={index} className="thought-item">
              <div className="thought-subject">{thought.subject}</div>
              {thought.description && (
                <div className="thought-description">{thought.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
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
