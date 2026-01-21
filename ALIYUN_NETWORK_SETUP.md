# 阿里云服务器网络配置指南

## 问题：无法访问服务器

如果无法访问 `http://47.253.136.182:41242/`，需要配置以下内容：

## 1. 阿里云安全组配置（必需）

### 步骤 1: 登录阿里云控制台

1. 访问 [阿里云控制台](https://ecs.console.aliyun.com/)
2. 进入 **云服务器 ECS** > **实例**

### 步骤 2: 配置安全组规则

1. 找到你的服务器实例（IP: 47.253.136.182）
2. 点击实例名称进入详情页
3. 点击 **安全组** 标签页
4. 点击安全组ID进入安全组规则页面
5. 点击 **添加安全组规则**

### 步骤 3: 添加入站规则

配置如下：

- **规则方向**: 入方向
- **授权策略**: 允许
- **优先级**: 1（数字越小优先级越高）
- **协议类型**: 自定义TCP
- **端口范围**: 41242/41242
- **授权对象**: 0.0.0.0/0（允许所有IP访问，生产环境建议限制特定IP）
- **描述**: Gemini CLI Web UI

点击 **保存**。

### 步骤 4: 验证安全组规则

确保规则已添加成功，应该能看到类似这样的规则：

```
方向    协议    端口范围    授权对象        描述
入方向   TCP     41242/41242  0.0.0.0/0      Gemini CLI Web UI
```

## 2. 服务器防火墙配置

### 检查防火墙状态

```bash
# CentOS/RHEL 7+ (使用 firewalld)
systemctl status firewalld

# CentOS/RHEL 6 或 Ubuntu (使用 iptables)
systemctl status iptables
# 或
service iptables status
```

### 配置 firewalld (CentOS/RHEL 7+)

```bash
# 查看防火墙状态
firewall-cmd --state

# 如果防火墙是运行状态，添加端口规则
firewall-cmd --permanent --add-port=41242/tcp
firewall-cmd --reload

# 验证端口是否已添加
firewall-cmd --list-ports
```

### 配置 iptables (CentOS/RHEL 6 或 Ubuntu)

```bash
# 添加规则
iptables -I INPUT -p tcp --dport 41242 -j ACCEPT

# 保存规则（CentOS/RHEL）
service iptables save
# 或
/usr/libexec/iptables/iptables.init save

# Ubuntu 需要安装 iptables-persistent
apt-get install iptables-persistent
netfilter-persistent save
```

### 临时关闭防火墙（仅用于测试）

```bash
# firewalld
systemctl stop firewalld
systemctl disable firewalld

# iptables
systemctl stop iptables
# 或
service iptables stop
```

**注意**: 关闭防火墙会降低服务器安全性，仅用于测试。生产环境应该配置规则而非关闭防火墙。

## 3. 验证服务器监听状态

### 检查服务器是否正在监听

```bash
# 检查端口是否被监听
netstat -tlnp | grep 41242
# 或
ss -tlnp | grep 41242
# 或
lsof -i :41242
```

应该看到类似这样的输出：

```
tcp        0      0 0.0.0.0:41242           0.0.0.0:*               LISTEN      12345/node
```

**重要**: 确保监听地址是 `0.0.0.0:41242`，而不是 `127.0.0.1:41242`。

### 检查服务器启动日志

```bash
# 查看服务器启动日志，确认监听地址
npm run start:a2a-server
```

应该看到类似这样的日志：

```
[INFO] Agent Server started on http://0.0.0.0:41242
[INFO] Server is accessible externally at http://47.253.136.182:41242
```

## 4. 验证环境变量配置

确保 `.env` 文件配置正确：

```bash
cat .env
```

应该包含：

```bash
CODER_AGENT_PORT=41242
CODER_AGENT_HOST=0.0.0.0
CODER_AGENT_PUBLIC_HOST=47.253.136.182
```

## 5. 本地测试连接

### 在服务器上测试本地连接

```bash
# 测试本地连接
curl http://localhost:41242
curl http://127.0.0.1:41242
curl http://0.0.0.0:41242
```

### 从外部测试连接

```bash
# 在本地机器上测试（替换为你的服务器IP）
curl http://47.253.136.182:41242

# 或使用 telnet 测试端口是否开放
telnet 47.253.136.182 41242
```

## 6. 常见问题排查

### 问题 1: 安全组已配置但仍无法访问

**解决方案**:

1. 检查安全组规则是否应用到正确的服务器实例
2. 确认服务器绑定了正确的安全组
3. 等待几分钟让规则生效

### 问题 2: 防火墙规则不生效

**解决方案**:

```bash
# 检查防火墙规则顺序
iptables -L -n --line-numbers

# 如果规则被其他规则阻止，调整优先级
iptables -I INPUT 1 -p tcp --dport 41242 -j ACCEPT
```

### 问题 3: 服务器监听在 127.0.0.1 而非 0.0.0.0

**解决方案**:

```bash
# 检查环境变量
echo $CODER_AGENT_HOST

# 如果未设置或设置为 localhost，修改 .env 文件
# CODER_AGENT_HOST=0.0.0.0

# 重启服务器
npm run start:a2a-server
```

### 问题 4: 端口被其他程序占用

**解决方案**:

```bash
# 查找占用端口的进程
lsof -i :41242
# 或
netstat -tlnp | grep 41242

# 杀死占用端口的进程（谨慎操作）
kill -9 <PID>

# 或使用其他端口
export CODER_AGENT_PORT=8080
npm run start:a2a-server
```

## 7. 完整检查清单

按照以下顺序检查：

- [ ] 阿里云安全组已添加端口 41242 的入站规则
- [ ] 服务器防火墙已开放端口 41242
- [ ] `.env` 文件中 `CODER_AGENT_HOST=0.0.0.0`
- [ ] 服务器正在监听 `0.0.0.0:41242`（不是 `127.0.0.1:41242`）
- [ ] 服务器进程正在运行
- [ ] 本地测试 `curl http://localhost:41242` 成功
- [ ] 外部测试 `curl http://47.253.136.182:41242` 成功

## 8. 使用 Nginx 反向代理（推荐生产环境）

如果使用 Nginx 反向代理，可以：

1. 服务器监听 localhost，提高安全性
2. 使用标准 HTTP/HTTPS 端口（80/443）
3. 配置 SSL 证书

Nginx 配置示例见 `DEPLOYMENT.md`。

## 快速诊断命令

```bash
# 一键检查所有配置
echo "=== 检查端口监听 ==="
netstat -tlnp | grep 41242 || echo "端口未监听"

echo "=== 检查防火墙 ==="
firewall-cmd --list-ports 2>/dev/null || iptables -L -n | grep 41242 || echo "防火墙规则未找到"

echo "=== 检查环境变量 ==="
cat .env | grep CODER_AGENT

echo "=== 测试本地连接 ==="
curl -s http://localhost:41242 | head -5 || echo "本地连接失败"
```
