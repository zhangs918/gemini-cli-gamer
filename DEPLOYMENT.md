# 部署指南

本文档说明如何将 Gemini CLI Web UI 部署到远程服务器。

## 快速开始

### 使用部署脚本（推荐）

```bash
# 1. 克隆项目
git clone <repository-url>
cd gemini-cli-gamer

# 2. 运行部署脚本
chmod +x deploy.sh
./deploy.sh

# 3. 编辑 .env 文件，设置 API 密钥和服务器配置
nano .env

# 4. 启动服务器
npm run start:a2a-server
```

### 手动部署

如果不想使用脚本，请按照下面的详细步骤操作。

## 系统要求

- **Node.js**: >= 20.0.0
- **npm**: >= 9.0.0（通常随 Node.js 一起安装）
- **操作系统**: Linux, macOS, 或 Windows
- **内存**: 建议至少 2GB RAM
- **磁盘空间**: 建议至少 1GB 可用空间

## 安装步骤

### 1. 安装 Node.js

如果服务器上还没有安装 Node.js，请先安装：

#### Ubuntu/Debian

```bash
# 使用 NodeSource 仓库安装 Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # 应该显示 v20.x.x 或更高
npm --version   # 应该显示 9.x.x 或更高
```

#### CentOS/RHEL

```bash
# 使用 NodeSource 仓库安装 Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# 验证安装
node --version
npm --version
```

#### macOS (使用 Homebrew)

```bash
brew install node@20
```

### 2. 克隆项目

```bash
# 克隆仓库
git clone <repository-url>
cd gemini-cli-gamer

# 或者如果已有项目，拉取最新代码
git pull origin main
```

### 3. 安装依赖

```bash
# 在项目根目录执行
npm install
```

这个过程可能需要几分钟，因为需要安装所有工作区的依赖。

**注意**: 如果遇到网络问题，可以使用国内镜像：

```bash
# 使用淘宝镜像
npm config set registry https://registry.npmmirror.com
npm install

# 或者使用 cnpm
npm install -g cnpm --registry=https://registry.npmmirror.com
cnpm install
```

### 4. 配置环境变量

创建 `.env` 文件：

```bash
# 在项目根目录创建 .env 文件
cat > .env << EOF
# Gemini API 密钥（必需）
GEMINI_API_KEY=your_api_key_here

# 服务器配置
CODER_AGENT_PORT=41242
CODER_AGENT_HOST=0.0.0.0
CODER_AGENT_PUBLIC_HOST=your-domain.com  # 或服务器 IP 地址
EOF
```

**重要**: 确保 `.env` 文件不会被提交到版本控制系统（已在 `.gitignore` 中）。

## 构建步骤

### 1. 构建前端 (Web UI)

```bash
# 进入前端目录
cd packages/web-ui

# 构建前端
npm run build

# 构建完成后会生成 dist/ 目录
cd ../..
```

### 2. 构建后端 (A2A Server)

```bash
# 在项目根目录执行
npm run build --workspace @google/gemini-cli-a2a-server
```

### 3. 一键构建（推荐）

```bash
# 在项目根目录执行，会构建所有必要的包
npm run build:packages
```

### 4. 验证构建结果

```bash
# 检查前端构建产物
ls -la packages/web-ui/dist/

# 检查后端构建产物
ls -la packages/a2a-server/dist/
```

应该看到：

- `packages/web-ui/dist/` 目录包含 `index.html` 和 `assets/` 目录
- `packages/a2a-server/dist/` 目录包含编译后的 JavaScript 文件

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

## 完整部署流程

### 快速部署脚本

创建一个部署脚本 `deploy.sh`：

```bash
#!/bin/bash
set -e

echo "🚀 开始部署 Gemini CLI Web UI..."

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js 20+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ 错误: Node.js 版本过低，需要 20+，当前版本: $(node -v)"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 2. 安装依赖
echo "📦 安装依赖..."
npm install

# 3. 检查 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  警告: 未找到 .env 文件"
    echo "请创建 .env 文件并设置 GEMINI_API_KEY"
    exit 1
fi

# 4. 构建前端
echo "🔨 构建前端..."
cd packages/web-ui
npm run build
cd ../..

# 5. 构建后端
echo "🔨 构建后端..."
npm run build --workspace @google/gemini-cli-a2a-server

echo "✅ 构建完成！"
echo ""
echo "启动服务器:"
echo "  npm run start:a2a-server"
echo ""
echo "或使用环境变量:"
echo "  CODER_AGENT_HOST=0.0.0.0 npm run start --workspace @google/gemini-cli-a2a-server"
```

使脚本可执行：

```bash
chmod +x deploy.sh
./deploy.sh
```

### 手动部署步骤

如果不想使用脚本，可以按照以下步骤手动部署：

#### 步骤 1: 安装依赖

```bash
# 在项目根目录
npm install
```

#### 步骤 2: 构建项目

```bash
# 方式 1: 分别构建
cd packages/web-ui && npm run build && cd ../..
npm run build --workspace @google/gemini-cli-a2a-server

# 方式 2: 一键构建所有包（推荐）
npm run build:packages
```

#### 步骤 3: 配置环境变量

确保 `.env` 文件已正确配置（见上面的"配置环境变量"部分）。

#### 步骤 4: 启动服务器

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

## 常见问题排查

### 构建失败

#### 问题: npm install 失败

**解决方案**:

```bash
# 清除 npm 缓存
npm cache clean --force

# 删除 node_modules 和 package-lock.json
rm -rf node_modules package-lock.json

# 重新安装
npm install
```

#### 问题: 构建时内存不足

**解决方案**:

```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build:packages
```

#### 问题: TypeScript 编译错误

**解决方案**:

```bash
# 确保所有依赖都已安装
npm install

# 清理并重新构建
npm run clean
npm run build:packages
```

### 运行时问题

#### 问题: 端口已被占用

**解决方案**:

```bash
# 检查端口占用
lsof -i :41242

# 或使用其他端口
export CODER_AGENT_PORT=8080
npm run start --workspace @google/gemini-cli-a2a-server
```

#### 问题: 无法从外部访问

**解决方案**:

1. 确保 `CODER_AGENT_HOST=0.0.0.0`
2. 检查防火墙规则
3. 检查服务器安全组设置（云服务器）

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

### 云服务器安全组配置

**重要**: 如果使用阿里云、腾讯云等云服务器，需要先在云控制台配置安全组规则：

- **阿里云**: 参考 [ALIYUN_NETWORK_SETUP.md](./ALIYUN_NETWORK_SETUP.md)
- **腾讯云**: 在安全组中添加端口 41242 的入站规则
- **AWS**: 在 Security Group 中添加端口 41242 的 Inbound 规则

### 服务器防火墙配置

确保防火墙允许访问配置的端口：

```bash
# Ubuntu/Debian
sudo ufw allow 41242/tcp

# CentOS/RHEL 7+ (firewalld)
sudo firewall-cmd --permanent --add-port=41242/tcp
sudo firewall-cmd --reload

# CentOS/RHEL 6 (iptables)
sudo iptables -I INPUT -p tcp --dport 41242 -j ACCEPT
sudo service iptables save
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
