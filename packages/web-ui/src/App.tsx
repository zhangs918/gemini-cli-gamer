/* eslint-disable */
import { useState, useEffect, useCallback } from 'react';
import Sidebar, { type Conversation } from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import WebView from './components/WebView';
import { apiClient } from './services/api';
import './App.css';

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);

  // 从后端加载会话列表
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const sessions = await apiClient.getSessions();
        const convs: Conversation[] = sessions.map((s) => ({
          id: s.id,
          title: s.title,
          workDir: s.workDir,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }));
        setConversations(convs);
        if (convs.length > 0) {
          setCurrentConversationId(convs[0].id);
        }
      } catch (error) {
        console.error('Failed to load sessions:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSessions();
  }, []);

  const handleNewConversation = useCallback(() => {
    // 不立即创建会话，而是设置 currentConversationId 为 null
    // 会话会在用户发送第一条消息时由后端创建
    setCurrentConversationId(null);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setCurrentConversationId(id);
  }, []);

  const handleUpdateConversationTitle = useCallback(
    async (id: string, title: string) => {
      try {
        await apiClient.updateSession(id, { title });
        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === id ? { ...conv, title, updatedAt: Date.now() } : conv,
          ),
        );
      } catch (error) {
        console.error('Failed to update session title:', error);
      }
    },
    [],
  );

  // 当新会话创建时，更新会话列表
  const handleSessionCreated = useCallback(
    (sessionId: string, workDir: string) => {
      const newConversation: Conversation = {
        id: sessionId,
        title: '新对话',
        workDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setConversations((prev) => [newConversation, ...prev]);
      setCurrentConversationId(sessionId);
    },
    [],
  );

  const handleAddMessage = useCallback(() => {
    if (currentConversationId) {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentConversationId
            ? { ...conv, updatedAt: Date.now() }
            : conv,
        ),
      );
    }
  }, [currentConversationId]);

  if (isLoading) {
    return (
      <div className="app loading">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  // 获取当前会话的 workDir
  const currentConversation = conversations.find(
    (conv) => conv.id === currentConversationId,
  );

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
      />
      <main className="app-main">
        <div className="app-main-left">
          <ChatInterface
            conversationId={currentConversationId}
            onUpdateTitle={handleUpdateConversationTitle}
            onAddMessage={handleAddMessage}
            onSessionCreated={handleSessionCreated}
          />
        </div>
        <div className="app-main-right">
          <WebView workDir={currentConversation?.workDir} />
        </div>
      </main>
    </div>
  );
}

export default App;
