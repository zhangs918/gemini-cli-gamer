# 部署指南

本文档说明如何将 Gemini CLI Web UI 部署到远程服务器。

## 环境变量配置

部署到远程服务器时，需要配置以下环境变量：

### 必需的环境变量

- `GEMINI_API_KEY`: Gemini API 密钥（必需）

### 服务器配置环境变量

- `CODER_AGENT_PORT`: 服务器监听端口（默认：随机端口）

  ```bash
  export CODER_AGENT_PORT=41242
  ```

- `CODER_AGENT_HOST`: 服务器监听地址（默认：`localhost`）
  - 本地开发：`localhost`（仅本地访问）
  - 远程部署：`0.0.0.0`（允许外部访问）

  ```bash
  export CODER_AGENT_HOST=0.0.0.0
  ```

- `CODER_AGENT_PUBLIC_HOST`: 外部访问的主机地址（仅在 `CODER_AGENT_HOST=0.0.0.0`
  时使用）
  - 如果服务器监听在 `0.0.0.0`，但需要通过特定域名或 IP 访问，设置此变量

  ```bash
  export CODER_AGENT_PUBLIC_HOST=your-domain.com
  # 或
  export CODER_AGENT_PUBLIC_HOST=123.45.67.89
  ```

- `CODER_AGENT_URL`: Agent Card 的完整 URL（可选，会自动生成）
  ```bash
  export CODER_AGENT_URL=https://your-domain.com:41242
  ```

## 部署步骤

### 1. 准备服务器

确保服务器已安装：

- Node.js (推荐 v18+)
- npm

### 2. 克隆项目

```bash
git clone <repository-url>
cd gemini-cli-gamer
npm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
# API 密钥（必需）
GEMINI_API_KEY=your_api_key_here

# 服务器配置
CODER_AGENT_PORT=41242
CODER_AGENT_HOST=0.0.0.0
CODER_AGENT_PUBLIC_HOST=your-domain.com  # 或服务器 IP
```

### 4. 构建项目

```bash
# 构建前端
cd packages/web-ui
npm run build
cd ../..

# 构建后端
npm run build --workspace @google/gemini-cli-a2a-server
```

### 5. 启动服务器

```bash
# 使用环境变量启动
CODER_AGENT_PORT=41242 \
CODER_AGENT_HOST=0.0.0.0 \
CODER_AGENT_PUBLIC_HOST=your-domain.com \
npm run start --workspace @google/gemini-cli-a2a-server
```

或使用启动脚本（需要先修改脚本中的环境变量）：

```bash
./start-web.sh
```

### 6. 配置反向代理（推荐）

使用 Nginx 或 Caddy 作为反向代理，支持 HTTPS：

#### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:41242;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 使用 Nginx 时的环境变量

如果使用反向代理，服务器可以监听 localhost：

```bash
CODER_AGENT_HOST=localhost  # 只监听本地
CODER_AGENT_PORT=41242
CODER_AGENT_PUBLIC_HOST=your-domain.com  # 外部访问地址
```

### 7. 使用进程管理器（推荐）

使用 PM2 管理进程：

```bash
# 安装 PM2
npm install -g pm2

# 创建 ecosystem.config.js
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'gemini-cli-web-ui',
    script: 'npm',
    args: 'run start --workspace @google/gemini-cli-a2a-server',
    env: {
      CODER_AGENT_PORT: 41242,
      CODER_AGENT_HOST: '0.0.0.0',
      CODER_AGENT_PUBLIC_HOST: 'your-domain.com',
      GEMINI_API_KEY: 'your_api_key_here'
    }
  }]
}
EOF

# 启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs gemini-cli-web-ui
```

## 防火墙配置

确保防火墙允许访问配置的端口：

```bash
# Ubuntu/Debian
sudo ufw allow 41242/tcp

# CentOS/RHEL
sudo firewall-cmd --add-port=41242/tcp --permanent
sudo firewall-cmd --reload
```

## 安全建议

1. **使用 HTTPS**：在生产环境使用反向代理配置 SSL/TLS 证书
2. **限制访问**：使用防火墙规则限制访问来源
3. **API 密钥安全**：不要将 API 密钥提交到版本控制系统
4. **定期更新**：保持依赖包和系统更新

## 故障排查

### 无法从外部访问

1. 检查 `CODER_AGENT_HOST` 是否设置为 `0.0.0.0`
2. 检查防火墙规则
3. 检查服务器网络配置

### Agent Card URL 不正确

1. 设置 `CODER_AGENT_PUBLIC_HOST` 环境变量
2. 或直接设置 `CODER_AGENT_URL` 环境变量

### 端口冲突

修改 `CODER_AGENT_PORT` 环境变量使用其他端口。
