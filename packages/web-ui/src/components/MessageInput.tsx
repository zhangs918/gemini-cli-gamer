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
      <div className="message-input-wrapper">
        <textarea
          className="message-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize textarea
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyPress={handleKeyPress}
          placeholder={disabled ? '正在处理...' : '给 Gemini CLI 发送消息'}
          disabled={disabled}
          rows={1}
        />
      </div>
      <button
        className="message-send-button"
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        aria-label="发送消息"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M15.5 2.5L8.5 9.5M15.5 2.5L11.5 15.5L8.5 9.5M15.5 2.5L2.5 6.5L8.5 9.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
};

export default MessageInput;
