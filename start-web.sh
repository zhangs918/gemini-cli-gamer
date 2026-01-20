#!/bin/bash

# Gemini CLI Web UI 启动脚本

set -e

echo "🚀 启动 Gemini CLI Web UI..."

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "❌ 错误: 未找到 .env 文件"
    echo "请创建 .env 文件并设置 GEMINI_API_KEY"
    exit 1
fi

# 检查 GEMINI_API_KEY 是否设置
if ! grep -q "GEMINI_API_KEY=" .env || grep -q "GEMINI_API_KEY=YOUR_API_KEY_HERE" .env; then
    echo "⚠️  警告: .env 文件中的 GEMINI_API_KEY 可能未正确设置"
    echo "请确保 .env 文件包含有效的 GEMINI_API_KEY"
fi

# 加载环境变量
export $(cat .env | grep -v '^#' | xargs)

# 检查前端是否已构建
if [ ! -d "packages/web-ui/dist" ]; then
    echo "📦 构建前端..."
    cd packages/web-ui
    npm run build
    cd ../..
else
    echo "✅ 前端已构建"
fi

# 检查后端是否已构建
if [ ! -d "packages/a2a-server/dist" ]; then
    echo "📦 构建后端..."
    npm run build --workspace @google/gemini-cli-a2a-server
else
    echo "✅ 后端已构建"
fi

# 启动服务器
echo "🌐 启动服务器..."
echo "访问地址: http://localhost:41242"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

npm run start:a2a-server

