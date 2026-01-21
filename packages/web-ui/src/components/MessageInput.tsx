/* eslint-disable */
import React, {
  useState,
  useRef,
  useCallback,
  KeyboardEvent,
  DragEvent,
  ChangeEvent,
} from 'react';
import type { Attachment } from '../types';
import './MessageInput.css';

// 支持的文件类型
const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/webm',
];
const SUPPORTED_DOC_TYPES = ['application/pdf'];

const ALL_SUPPORTED_TYPES = [
  ...SUPPORTED_IMAGE_TYPES,
  ...SUPPORTED_VIDEO_TYPES,
  ...SUPPORTED_AUDIO_TYPES,
  ...SUPPORTED_DOC_TYPES,
];

// 最大文件大小 20MB（与 gemini-cli 一致）
const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface MessageInputProps {
  onSend: (message: string, attachments?: Attachment[]) => void;
  disabled?: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSend, disabled }) => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 读取文件为 base64
  const readFileAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // 移除 data:xxx;base64, 前缀
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // 处理文件
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const newAttachments: Attachment[] = [];

      for (const file of Array.from(files)) {
        // 检查文件类型
        if (!ALL_SUPPORTED_TYPES.includes(file.type)) {
          console.warn(`不支持的文件类型: ${file.type}`);
          continue;
        }

        // 检查文件大小
        if (file.size > MAX_FILE_SIZE) {
          console.warn(`文件过大 (最大 20MB): ${file.name}`);
          continue;
        }

        try {
          const base64 = await readFileAsBase64(file);
          const attachment: Attachment = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            type: file.type,
            size: file.size,
            data: base64,
          };

          // 为图片和视频创建预览 URL
          if (
            SUPPORTED_IMAGE_TYPES.includes(file.type) ||
            SUPPORTED_VIDEO_TYPES.includes(file.type)
          ) {
            attachment.previewUrl = URL.createObjectURL(file);
          }

          newAttachments.push(attachment);
        } catch (error) {
          console.error(`读取文件失败: ${file.name}`, error);
        }
      }

      if (newAttachments.length > 0) {
        setAttachments((prev) => [...prev, ...newAttachments]);
      }
    },
    [readFileAsBase64],
  );

  // 移除附件
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((a) => a.id === id);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  // 清理所有附件
  const clearAttachments = useCallback(() => {
    attachments.forEach((a) => {
      if (a.previewUrl) {
        URL.revokeObjectURL(a.previewUrl);
      }
    });
    setAttachments([]);
  }, [attachments]);

  const handleSend = () => {
    if ((input.trim() || attachments.length > 0) && !disabled) {
      onSend(input, attachments.length > 0 ? attachments : undefined);
      setInput('');
      clearAttachments();
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 拖拽处理
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!disabled && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // 文件选择
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      // 重置 input 以允许重复选择同一文件
      e.target.value = '';
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 获取文件图标
  const getFileIcon = (type: string): string => {
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type === 'application/pdf') return '📄';
    return '📎';
  };

  return (
    <div
      className={`message-input-container ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 附件预览区域 */}
      {attachments.length > 0 && (
        <div className="attachments-preview">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="attachment-item">
              {attachment.previewUrl &&
              SUPPORTED_IMAGE_TYPES.includes(attachment.type) ? (
                <img
                  src={attachment.previewUrl}
                  alt={attachment.name}
                  className="attachment-thumbnail"
                />
              ) : attachment.previewUrl &&
                SUPPORTED_VIDEO_TYPES.includes(attachment.type) ? (
                <video
                  src={attachment.previewUrl}
                  className="attachment-thumbnail"
                  muted
                />
              ) : (
                <div className="attachment-icon">
                  {getFileIcon(attachment.type)}
                </div>
              )}
              <div className="attachment-info">
                <span className="attachment-name" title={attachment.name}>
                  {attachment.name}
                </span>
                <span className="attachment-size">
                  {formatFileSize(attachment.size)}
                </span>
              </div>
              <button
                className="attachment-remove"
                onClick={() => removeAttachment(attachment.id)}
                aria-label="移除附件"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 拖拽提示 */}
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <span className="drag-icon">📎</span>
            <span>释放以添加文件</span>
          </div>
        </div>
      )}

      <div className="message-input-row">
        {/* 添加文件按钮 */}
        <button
          className="message-attach-button"
          onClick={openFilePicker}
          disabled={disabled}
          aria-label="添加文件"
          title="添加图片、视频、音频或 PDF"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALL_SUPPORTED_TYPES.join(',')}
          onChange={handleFileSelect}
          className="hidden-file-input"
        />

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
            placeholder={
              disabled
                ? '正在处理...'
                : '给 Gemini CLI 发送消息（支持拖拽图片/视频/音频/PDF）'
            }
            disabled={disabled}
            rows={1}
          />
        </div>
        <button
          className="message-send-button"
          onClick={handleSend}
          disabled={disabled || (!input.trim() && attachments.length === 0)}
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
    </div>
  );
};

export default MessageInput;
