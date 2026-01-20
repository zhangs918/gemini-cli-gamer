# Gemini CLI Web UI

Gemini CLI 的网页前端界面。

## 开发

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

开发服务器会在 `http://localhost:3000` 启动，并自动代理 API 请求到
`http://localhost:41242`。

### 构建生产版本

```bash
npm run build
```

构建产物会输出到 `dist/` 目录。

## 功能

- 💬 实时聊天界面
- 🔄 SSE 流式响应
- 🛠️ 工具调用确认
- 💾 会话管理
- 🎨 现代化 UI 设计

## API 端点

前端通过以下 API 端点与后端通信：

- `POST /api/v1/chat` - 发送消息并获取流式响应
- `POST /api/v1/tools/confirm` - 确认工具调用
- `GET /api/v1/session/:sessionId` - 获取会话信息

## 技术栈

- React 19
- TypeScript
- Vite
- CSS3
