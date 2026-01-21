/* eslint-disable */
import React from 'react';
import './WebView.css';

interface WebViewProps {
  url?: string;
}

const WebView: React.FC<WebViewProps> = ({ url }) => {
  return (
    <div className="web-view">
      {url ? (
        <iframe
          src={url}
          className="web-view-iframe"
          title="Web View"
          allow="clipboard-read; clipboard-write"
        />
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
