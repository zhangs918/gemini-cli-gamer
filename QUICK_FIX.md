# 快速修复指南

## 问题：后端构建文件缺失

如果遇到
`Cannot find module '/root/gemini-cli-gamer/packages/a2a-server/dist/src/http/server.js'`
错误，说明后端没有正确构建。

## 解决方案

### 方案 1: 强制重新构建（推荐）

```bash
# 在项目根目录执行
cd /root/gemini-cli-gamer

# 强制重新构建后端
npm run build --workspace @google/gemini-cli-a2a-server

# 验证构建结果
ls -la packages/a2a-server/dist/src/http/server.js

# 如果文件存在，启动服务器
npm run start:a2a-server
```

### 方案 2: 清理后重新构建

```bash
# 清理构建产物
rm -rf packages/a2a-server/dist
rm -rf packages/web-ui/dist

# 重新构建所有包
npm run build:packages

# 启动服务器
npm run start:a2a-server
```

### 方案 3: 使用更新后的部署脚本

```bash
# 拉取最新代码（如果已修复）
git pull

# 或手动更新 deploy.sh 后运行
chmod +x deploy.sh
./deploy.sh
```

## 验证步骤

构建完成后，验证关键文件是否存在：

```bash
# 检查前端
ls -la packages/web-ui/dist/index.html

# 检查后端
ls -la packages/a2a-server/dist/src/http/server.js

# 如果两个文件都存在，说明构建成功
```

## 如果构建仍然失败

1. **检查 Node.js 版本**：

   ```bash
   node --version  # 应该是 v20.x.x 或更高
   ```

2. **检查依赖是否完整安装**：

   ```bash
   npm install
   ```

3. **查看详细构建日志**：

   ```bash
   npm run build --workspace @google/gemini-cli-a2a-server 2>&1 | tee build.log
   ```

4. **检查磁盘空间**：

   ```bash
   df -h
   ```

5. **检查内存**：
   ```bash
   free -h
   # 如果内存不足，可以增加 Node.js 内存限制
   export NODE_OPTIONS="--max-old-space-size=4096"
   npm run build --workspace @google/gemini-cli-a2a-server
   ```
