#!/usr/bin/env node
/**
 * SSE 流式响应测试脚本
 * 模拟 Web UI 的行为，测试后端 API 的流式响应
 */

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 41242;
const API_PATH = '/api/v1/chat';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(color, prefix, message) {
  console.log(`${color}${prefix}${colors.reset} ${message}`);
}

function testSSE(message, sessionId) {
  return new Promise((resolve, reject) => {
    log(colors.cyan, '[TEST]', `发送消息: "${message}"`);

    const postData = JSON.stringify({
      message,
      sessionId,
    });

    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const events = [];
    let buffer = '';
    let hasError = false;
    let streamingContent = '';
    let messageId = null;
    let thoughts = [];
    let toolCalls = [];
    let toolResults = [];

    const req = http.request(options, (res) => {
      log(colors.blue, '[HTTP]', `状态码: ${res.statusCode}`);
      log(colors.blue, '[HTTP]', `Content-Type: ${res.headers['content-type']}`);

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      if (!res.headers['content-type']?.includes('text/event-stream')) {
        log(colors.red, '[ERROR]', '响应不是 SSE 格式！');
        reject(new Error('Not SSE response'));
        return;
      }

      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');

        // 保留最后一行（可能不完整）
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              events.push(data);

              // 模拟前端处理逻辑
              if (data.type === 'messageId') {
                messageId = data.messageId;
                log(colors.green, '[SSE]', `收到 messageId: ${messageId}`);
              } else if (data.type === 'text') {
                streamingContent += data.content || '';
                log(colors.green, '[SSE]', `收到文本: "${data.content}"`);
              } else if (data.type === 'thought') {
                thoughts.push(data.thought);
                log(colors.magenta, '[SSE]', `收到思考: ${data.thought?.subject}`);
              } else if (data.type === 'tool_call') {
                toolCalls.push(data.toolCall);
                log(colors.yellow, '[SSE]', `收到工具调用: ${data.toolCall?.name}`);
              } else if (data.type === 'tool_executing') {
                log(
                  colors.yellow,
                  '[SSE]',
                  `工具执行中: ${data.name || 'unknown'} ${data.toolCallId ? `(${data.toolCallId})` : ''}`,
                );
              } else if (data.type === 'tool_result') {
                toolResults.push(data.result);
                log(colors.yellow, '[SSE]', `收到工具结果`);
              } else if (data.type === 'done') {
                log(colors.green, '[SSE]', '流式响应完成 ✓');
              } else if (data.type === 'error') {
                log(colors.red, '[SSE]', `收到错误: ${data.error}`);
                hasError = true;
              } else {
                log(colors.yellow, '[SSE]', `未知事件类型: ${data.type}`);
              }
            } catch (e) {
              log(colors.red, '[ERROR]', `解析 SSE 数据失败: ${e.message}`);
              log(colors.red, '[ERROR]', `原始数据: ${line}`);
            }
          }
        }
      });

      res.on('end', () => {
        log(colors.blue, '[HTTP]', '连接关闭');

        // 打印所有事件类型顺序
        log(colors.cyan, '\n[事件序列]', events.map((e) => e.type).join(' → '));

        // 统计信息
        log(colors.cyan, '\n[统计]', `总事件数: ${events.length}`);
        log(colors.cyan, '[统计]', `messageId: ${messageId || '未收到'}`);
        log(colors.cyan, '[统计]', `文本内容长度: ${streamingContent.length} 字符`);
        log(colors.cyan, '[统计]', `思考步骤: ${thoughts.length} 个`);
        log(colors.cyan, '[统计]', `工具调用: ${toolCalls.length} 个`);
        log(colors.cyan, '[统计]', `工具结果: ${toolResults.length} 个`);

        if (streamingContent) {
          log(colors.green, '\n[内容]', '完整回复:');
          console.log(colors.bright + streamingContent + colors.reset);
        }

        // 验证结果
        const hasDoneEvent = events.some((e) => e.type === 'done');
        const hasContent = streamingContent.length > 0;

        console.log('\n' + '='.repeat(60));
        if (hasError) {
          log(colors.red, '[结果]', '❌ 测试失败：收到错误事件');
          resolve({ success: false, reason: 'error_event', events });
        } else if (!hasDoneEvent) {
          log(colors.red, '[结果]', '❌ 测试失败：未收到 done 事件');
          resolve({ success: false, reason: 'no_done_event', events });
        } else if (!hasContent && toolCalls.length === 0) {
          log(
            colors.yellow,
            '[结果]',
            '⚠️  警告：没有文本内容也没有工具调用',
          );
          resolve({ success: true, warning: true, events });
        } else {
          log(colors.green, '[结果]', '✅ 测试成功！');
          resolve({ success: true, events });
        }
        console.log('='.repeat(60) + '\n');
      });
    });

    req.on('error', (err) => {
      log(colors.red, '[ERROR]', `请求失败: ${err.message}`);
      reject(err);
    });

    req.on('timeout', () => {
      log(colors.red, '[ERROR]', '请求超时');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(60000); // 60秒超时
    req.write(postData);
    req.end();
  });
}

// 主测试流程
async function main() {
  console.log('\n' + '='.repeat(60));
  log(colors.bright, '[开始]', 'SSE 流式响应测试');
  console.log('='.repeat(60) + '\n');

  const sessionId = `test-${Date.now()}`;

  try {
    // 测试1: 简单消息（不涉及工具调用）
    log(colors.bright, '\n[测试 1]', '简单消息（不涉及工具）');
    await testSSE('你好', sessionId);
    await new Promise((r) => setTimeout(r, 1000));

    // 测试2: 需要工具调用的消息
    log(colors.bright, '\n[测试 2]', '工具调用消息');
    await testSSE('帮我列出当前目录的所有文件', sessionId);
    await new Promise((r) => setTimeout(r, 1000));

    // 测试3: 复杂的工具调用
    log(colors.bright, '\n[测试 3]', '复杂工具调用');
    await testSSE('读取 package.json 并告诉我项目名称', sessionId);

    log(colors.green, '\n[完成]', '所有测试完成！');
  } catch (error) {
    log(colors.red, '[失败]', `测试失败: ${error.message}`);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main();
}

