/* eslint-disable */
import React, { useRef, useCallback, useMemo } from 'react';
import './WebView.css';

interface WebViewProps {
  workDir?: string;
}

const WebView: React.FC<WebViewProps> = ({ workDir }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 从 workDir 中提取 projectId（最后一段路径）
  const projectId = useMemo(() => {
    if (!workDir) return null;
    const parts = workDir.split('/').filter(Boolean);
    return parts[parts.length - 1] || null;
  }, [workDir]);

  // 构建 index.html 的 URL（使用 /preview 路径）
  const iframeUrl = useMemo(() => {
    if (!projectId) return null;
    return `/preview/${projectId}/index.html`;
  }, [projectId]);

  // 重新加载 iframe
  const handleReload = useCallback(() => {
    if (iframeRef.current) {
      // 强制刷新 iframe：通过重新设置 src 来实现
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = '';
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = currentSrc;
        }
      }, 50);
    }
  }, []);

  // 复制 web view URL 到剪切板
  const handleShare = useCallback(async () => {
    if (!iframeUrl) return;

    // 构建完整的 URL
    const fullUrl = `${window.location.origin}${iframeUrl}`;

    try {
      await navigator.clipboard.writeText(fullUrl);
      // 可以添加一个提示，但这里先简单实现
    } catch (err) {
      console.error('复制失败:', err);
      // 降级方案：使用传统的复制方法
      const textArea = document.createElement('textarea');
      textArea.value = fullUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (fallbackErr) {
        console.error('降级复制也失败:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  }, [iframeUrl]);

  return (
    <div className="web-view">
      {iframeUrl ? (
        <>
          <div className="web-view-content">
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              className="web-view-iframe"
              title="Web View"
              allow="clipboard-read; clipboard-write"
            />
          </div>
          <div className="web-view-toolbar">
            <button
              className="reload-button"
              onClick={handleReload}
              title="重新加载"
            >
              <span className="reload-icon">↻</span>
              <span className="reload-text">重新加载</span>
            </button>
            <button
              className="share-button"
              onClick={handleShare}
              title="分享链接"
            >
              <span className="share-icon">🔗</span>
              <span className="share-text">分享</span>
            </button>
          </div>
        </>
      ) : (
        <div className="web-view-empty">
          <div className="empty-icon">🌐</div>
          <h3>Web View</h3>
          <p>等待加载网页内容</p>
        </div>
      )}
    </div>
  );
};

export default WebView;
