/* eslint-disable */
import React, { useState, KeyboardEvent } from 'react';
import './MessageInput.css';

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSend, disabled }) => {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input);
      setInput('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-input-container">
      <textarea
        className="message-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyPress={handleKeyPress}
        placeholder={
          disabled
            ? '正在处理...'
            : '输入消息... (Enter 发送, Shift+Enter 换行)'
        }
        disabled={disabled}
        rows={1}
      />
      <button
        className="message-send-button"
        onClick={handleSend}
        disabled={disabled || !input.trim()}
      >
        发送
      </button>
    </div>
  );
};

export default MessageInput;
