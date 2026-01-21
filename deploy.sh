#!/bin/bash

# Gemini CLI Web UI 部署脚本
# 用于在远程服务器上安装和构建项目

set -e

echo "🚀 开始部署 Gemini CLI Web UI..."
echo ""

# 1. 检查 Node.js
echo "📋 检查系统要求..."
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js 20+"
    echo ""
    echo "Ubuntu/Debian:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo ""
    echo "CentOS/RHEL:"
    echo "  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -"
    echo "  sudo yum install -y nodejs"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ 错误: Node.js 版本过低，需要 20+，当前版本: $(node -v)"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"
echo "✅ npm 版本: $(npm -v)"
echo ""

# 2. 检查 .env 文件
if [ ! -f .env ]; then
    echo "⚠️  警告: 未找到 .env 文件"
    echo "正在创建示例 .env 文件..."
    cat > .env << EOF
# Gemini API 密钥（必需）
GEMINI_API_KEY=your_api_key_here

# 服务器配置
CODER_AGENT_PORT=41242
CODER_AGENT_HOST=0.0.0.0
CODER_AGENT_PUBLIC_HOST=your-domain.com
EOF
    echo "✅ 已创建 .env 文件，请编辑并设置 GEMINI_API_KEY"
    echo ""
fi

# 3. 安装依赖
echo "📦 安装依赖..."
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "✅ 依赖已安装，跳过..."
fi
echo ""

# 4. 构建前端
echo "🔨 构建前端..."
if [ ! -f "packages/web-ui/dist/index.html" ]; then
    echo "   正在构建前端..."
    cd packages/web-ui
    npm run build
    cd ../..
    echo "✅ 前端构建完成"
else
    echo "✅ 前端已构建，跳过..."
fi
echo ""

# 5. 构建核心包（a2a-server 的依赖）
echo "🔨 构建核心包..."
if [ ! -f "packages/core/dist/index.js" ]; then
    echo "   正在构建 @google/gemini-cli-core..."
    npm run build --workspace @google/gemini-cli-core
    echo "✅ 核心包构建完成"
else
    echo "✅ 核心包已构建，跳过..."
fi
echo ""

# 6. 构建后端
echo "🔨 构建后端..."
if [ ! -f "packages/a2a-server/dist/src/http/server.js" ]; then
    echo "   正在构建 @google/gemini-cli-a2a-server..."
    npm run build --workspace @google/gemini-cli-a2a-server
    echo "✅ 后端构建完成"
else
    echo "✅ 后端已构建，跳过..."
fi
echo ""

# 验证构建结果
echo "🔍 验证构建结果..."
if [ ! -f "packages/web-ui/dist/index.html" ]; then
    echo "❌ 错误: 前端构建失败，未找到 packages/web-ui/dist/index.html"
    exit 1
fi

if [ ! -f "packages/core/dist/index.js" ]; then
    echo "❌ 错误: 核心包构建失败，未找到 packages/core/dist/index.js"
    echo "   正在重新构建核心包..."
    npm run build --workspace @google/gemini-cli-core
    if [ ! -f "packages/core/dist/index.js" ]; then
        echo "❌ 错误: 核心包构建仍然失败，请检查构建日志"
        exit 1
    fi
fi

if [ ! -f "packages/a2a-server/dist/src/http/server.js" ]; then
    echo "❌ 错误: 后端构建失败，未找到 packages/a2a-server/dist/src/http/server.js"
    echo "   正在重新构建后端..."
    npm run build --workspace @google/gemini-cli-a2a-server
    if [ ! -f "packages/a2a-server/dist/src/http/server.js" ]; then
        echo "❌ 错误: 后端构建仍然失败，请检查构建日志"
        exit 1
    fi
fi
echo "✅ 构建验证通过"
echo ""

# 7. 显示启动信息
echo "✅ 部署完成！"
echo ""
echo "📝 下一步："
echo ""
echo "1. 编辑 .env 文件，设置正确的配置："
echo "   - GEMINI_API_KEY: 你的 API 密钥"
echo "   - CODER_AGENT_PUBLIC_HOST: 你的域名或 IP 地址"
echo ""
echo "2. 启动服务器："
echo "   npm run start:a2a-server"
echo ""
echo "   或使用自定义配置："
echo "   CODER_AGENT_HOST=0.0.0.0 \\"
echo "   CODER_AGENT_PORT=41242 \\"
echo "   npm run start --workspace @google/gemini-cli-a2a-server"
echo ""
echo "3. 访问地址："
if [ -f .env ]; then
    source .env
    if [ -n "$CODER_AGENT_PUBLIC_HOST" ] && [ "$CODER_AGENT_PUBLIC_HOST" != "your-domain.com" ]; then
        echo "   http://$CODER_AGENT_PUBLIC_HOST:${CODER_AGENT_PORT:-41242}"
    else
        echo "   http://<服务器IP>:${CODER_AGENT_PORT:-41242}"
    fi
else
    echo "   http://<服务器IP>:41242"
fi
echo ""

