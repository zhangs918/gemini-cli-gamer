/* eslint-disable */
import { useState, useEffect } from 'react';
import './Sidebar.css';

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  currentConversationId,
  onNewConversation,
  onSelectConversation,
}) => {
  const [groupedConversations, setGroupedConversations] = useState<{
    [key: string]: Conversation[];
  }>({});

  useEffect(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const grouped: { [key: string]: Conversation[] } = {
      recent: [],
      older: [],
    };

    conversations.forEach((conv) => {
      if (conv.updatedAt >= thirtyDaysAgo) {
        grouped.recent.push(conv);
      } else {
        grouped.older.push(conv);
      }
    });

    // Sort by updatedAt descending
    grouped.recent.sort((a, b) => b.updatedAt - a.updatedAt);
    grouped.older.sort((a, b) => b.updatedAt - a.updatedAt);

    // Group older conversations by month
    const olderGrouped: { [key: string]: Conversation[] } = {};
    grouped.older.forEach((conv) => {
      const date = new Date(conv.updatedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!olderGrouped[monthKey]) {
        olderGrouped[monthKey] = [];
      }
      olderGrouped[monthKey].push(conv);
    });

    const result: { [key: string]: Conversation[] } = {};
    if (grouped.recent.length > 0) {
      result['30天内'] = grouped.recent;
    }
    Object.keys(olderGrouped)
      .sort()
      .reverse()
      .forEach((key) => {
        result[key] = olderGrouped[key];
      });

    setGroupedConversations(result);
  }, [conversations]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  };

  const truncateTitle = (title: string, maxLength: number = 30): string => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">G</div>
          <span className="logo-text">Gemini CLI</span>
        </div>
      </div>

      <div className="sidebar-content">
        <button className="new-conversation-btn" onClick={onNewConversation}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 3V13M3 8H13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          开启新对话
        </button>

        <div className="conversations-list">
          {Object.keys(groupedConversations).map((groupKey) => (
            <div key={groupKey} className="conversation-group">
              <div className="group-header">
                {groupKey === '30天内'
                  ? '30天内'
                  : formatDate(groupedConversations[groupKey][0].updatedAt)}
              </div>
              {groupedConversations[groupKey].map((conv) => (
                <div
                  key={conv.id}
                  className={`conversation-item ${
                    currentConversationId === conv.id ? 'active' : ''
                  }`}
                  onClick={() => onSelectConversation(conv.id)}
                >
                  {truncateTitle(conv.title)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
