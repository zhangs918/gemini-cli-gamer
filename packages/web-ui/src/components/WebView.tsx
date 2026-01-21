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
