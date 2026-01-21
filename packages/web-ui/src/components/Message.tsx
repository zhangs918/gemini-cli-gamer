/* eslint-disable */
import type { ChatMessage, ThoughtSummary, Attachment } from '../types';
import './Message.css';

// 支持的图片类型
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

interface MessageProps {
  message: ChatMessage;
  thoughts?: ThoughtSummary[];
}

// 渲染附件预览
const AttachmentPreview: React.FC<{ attachment: Attachment }> = ({
  attachment,
}) => {
  const isImage = SUPPORTED_IMAGE_TYPES.includes(attachment.type);
  const isVideo = SUPPORTED_VIDEO_TYPES.includes(attachment.type);

  // 获取文件图标
  const getFileIcon = (type: string): string => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type === 'application/pdf') return '📄';
    return '📎';
  };

  // 构建 data URL 用于预览
  const dataUrl = `data:${attachment.type};base64,${attachment.data}`;

  return (
    <div className="message-attachment">
      {isImage && (
        <img
          src={attachment.previewUrl || dataUrl}
          alt={attachment.name}
          className="attachment-preview-image"
          loading="lazy"
        />
      )}
      {isVideo && (
        <video
          src={attachment.previewUrl || dataUrl}
          className="attachment-preview-video"
          controls
          muted
        />
      )}
      {!isImage && !isVideo && (
        <div className="attachment-preview-file">
          <span className="attachment-file-icon">
            {getFileIcon(attachment.type)}
          </span>
          <span className="attachment-file-name">{attachment.name}</span>
        </div>
      )}
    </div>
  );
};

const Message: React.FC<MessageProps> = ({ message, thoughts }) => {
  const isUser = message.role === 'user';
  const hasAttachments = message.attachments && message.attachments.length > 0;

  // 分离附件标签和实际文本内容
  const getDisplayContent = () => {
    if (!hasAttachments) return message.content;

    // 如果有附件，移除显示中的附件标签部分（因为我们会单独渲染附件）
    const lines = message.content.split('\n');
    // 检查第一行是否是附件标签（格式：[filename] [filename2]...）
    if (lines[0] && /^\[.+\](\s+\[.+\])*$/.test(lines[0])) {
      return lines.slice(1).join('\n').trim();
    }
    return message.content;
  };

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
        {/* 附件预览区域 */}
        {hasAttachments && (
          <div className="message-attachments">
            {message.attachments!.map((attachment) => (
              <AttachmentPreview key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}
        <div className="message-content">
          {message.isStreaming ? (
            <>
              {message.content}
              <span className="message-cursor">▋</span>
            </>
          ) : (
            <div className="message-text">{getDisplayContent()}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Message;
