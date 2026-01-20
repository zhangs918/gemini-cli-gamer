/* eslint-disable */
import ChatInterface from './components/ChatInterface';
import './App.css';

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Gemini CLI Web UI</h1>
      </header>
      <main className="app-main">
        <ChatInterface />
      </main>
    </div>
  );
}

export default App;
