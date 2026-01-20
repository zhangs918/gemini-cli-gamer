/* eslint-disable */
import { useState, useEffect } from 'react';
import Sidebar, { type Conversation } from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import './App.css';

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);

  // Load conversations from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('gemini-conversations');
    if (saved) {
      const parsed = JSON.parse(saved) as Conversation[];
      setConversations(parsed);
      if (parsed.length > 0) {
        setCurrentConversationId(parsed[0].id);
      }
    }
  }, []);

  // Save conversations to localStorage
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem(
        'gemini-conversations',
        JSON.stringify(conversations),
      );
    }
  }, [conversations]);

  const handleNewConversation = () => {
    const newId = `conv-${Date.now()}`;
    const newConversation: Conversation = {
      id: newId,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [newConversation, ...prev]);
    setCurrentConversationId(newId);
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversationId(id);
  };

  const handleUpdateConversationTitle = (id: string, title: string) => {
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id ? { ...conv, title, updatedAt: Date.now() } : conv,
      ),
    );
  };

  const handleAddMessage = () => {
    if (currentConversationId) {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === currentConversationId
            ? { ...conv, updatedAt: Date.now() }
            : conv,
        ),
      );
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
      />
      <main className="app-main">
        <ChatInterface
          conversationId={currentConversationId}
          onUpdateTitle={handleUpdateConversationTitle}
          onAddMessage={handleAddMessage}
        />
      </main>
    </div>
  );
}

export default App;
