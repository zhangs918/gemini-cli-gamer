/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import * as path from 'node:path';
import * as url from 'node:url';

import type { AgentCard, Message } from '@a2a-js/sdk';
import type { TaskStore } from '@a2a-js/sdk/server';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  DefaultExecutionEventBus,
  type AgentExecutionEvent,
} from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express'; // Import server components
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import type { AgentSettings } from '../types.js';
import { GCSTaskStore, NoOpTaskStore } from '../persistence/gcs.js';
import { CoderAgentExecutor } from '../agent/executor.js';
import { requestStorage } from './requestStorage.js';
import { loadConfig, loadEnvironment, setTargetDir } from '../config/config.js';
import { loadSettings } from '../config/settings.js';
import { loadExtensions } from '../config/extension.js';
import { commandRegistry } from '../commands/command-registry.js';
import {
  debugLogger,
  SimpleExtensionLoader,
  ApprovalMode,
} from '@google/gemini-cli-core';
import type { Command, CommandArgument } from '../commands/types.js';
import { GitService } from '@google/gemini-cli-core';
import { setupChatRoutes, setSessionContext } from './chat-api.js';

type CommandResponse = {
  name: string;
  description: string;
  arguments: CommandArgument[];
  subCommands: CommandResponse[];
};

const coderAgentCard: AgentCard = {
  name: 'Gemini SDLC Agent',
  description:
    'An agent that generates code based on natural language instructions and streams file outputs.',
  url: 'http://localhost:41242/',
  provider: {
    organization: 'Google',
    url: 'https://google.com',
  },
  protocolVersion: '0.3.0',
  version: '0.0.2', // Incremented version
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  securitySchemes: undefined,
  security: undefined,
  defaultInputModes: ['text'],
  defaultOutputModes: ['text'],
  skills: [
    {
      id: 'code_generation',
      name: 'Code Generation',
      description:
        'Generates code snippets or complete files based on user requests, streaming the results.',
      tags: ['code', 'development', 'programming'],
      examples: [
        'Write a python function to calculate fibonacci numbers.',
        'Create an HTML file with a basic button that alerts "Hello!" when clicked.',
      ],
      inputModes: ['text'],
      outputModes: ['text'],
    },
  ],
  supportsAuthenticatedExtendedCard: false,
};

export function updateCoderAgentCardUrl(port: number) {
  coderAgentCard.url = `http://localhost:${port}/`;
}

async function handleExecuteCommand(
  req: express.Request,
  res: express.Response,
  context: {
    config: Awaited<ReturnType<typeof loadConfig>>;
    git: GitService | undefined;
    agentExecutor: CoderAgentExecutor;
  },
) {
  logger.info('[CoreAgent] Received /executeCommand request: ', req.body);
  const { command, args } = req.body;
  try {
    if (typeof command !== 'string') {
      return res.status(400).json({ error: 'Invalid "command" field.' });
    }

    if (args && !Array.isArray(args)) {
      return res.status(400).json({ error: '"args" field must be an array.' });
    }

    const commandToExecute = commandRegistry.get(command);

    if (commandToExecute?.requiresWorkspace) {
      if (!process.env['CODER_AGENT_WORKSPACE_PATH']) {
        return res.status(400).json({
          error: `Command "${command}" requires a workspace, but CODER_AGENT_WORKSPACE_PATH is not set.`,
        });
      }
    }

    if (!commandToExecute) {
      return res.status(404).json({ error: `Command not found: ${command}` });
    }

    if (commandToExecute.streaming) {
      const eventBus = new DefaultExecutionEventBus();
      res.setHeader('Content-Type', 'text/event-stream');
      const eventHandler = (event: AgentExecutionEvent) => {
        const jsonRpcResponse = {
          jsonrpc: '2.0',
          id: 'taskId' in event ? event.taskId : (event as Message).messageId,
          result: event,
        };
        res.write(`data: ${JSON.stringify(jsonRpcResponse)}\n`);
      };
      eventBus.on('event', eventHandler);

      await commandToExecute.execute({ ...context, eventBus }, args ?? []);

      eventBus.off('event', eventHandler);
      eventBus.finished();
      return res.end(); // Explicit return for streaming path
    } else {
      const result = await commandToExecute.execute(context, args ?? []);
      logger.info('[CoreAgent] Sending /executeCommand response: ', result);
      return res.status(200).json(result);
    }
  } catch (e) {
    logger.error(
      `Error executing /executeCommand: ${command} with args: ${JSON.stringify(
        args,
      )}`,
      e,
    );
    const errorMessage =
      e instanceof Error ? e.message : 'Unknown error executing command';
    return res.status(500).json({ error: errorMessage });
  }
}

export async function createApp() {
  try {
    // 保存原始工作目录（在 setTargetDir 改变之前）
    const originalCwd = process.cwd();

    // Load the server configuration once on startup.
    const workspaceRoot = setTargetDir(undefined);
    loadEnvironment();
    const settings = loadSettings(workspaceRoot);
    const extensions = loadExtensions(workspaceRoot);
    const config = await loadConfig(
      settings,
      new SimpleExtensionLoader(extensions),
      'a2a-server',
    );

    // Enable YOLO mode for chat API to auto-execute tools without user confirmation
    try {
      config.setApprovalMode(ApprovalMode.YOLO);
      logger.info('[CoreAgent] Chat API: YOLO mode enabled for auto-execution');
    } catch (error) {
      logger.warn('[CoreAgent] Could not set YOLO mode:', error);
    }

    let git: GitService | undefined;
    if (config.getCheckpointingEnabled()) {
      git = new GitService(config.getTargetDir(), config.storage);
      await git.initialize();
    }

    // loadEnvironment() is called within getConfig now
    const bucketName = process.env['GCS_BUCKET_NAME'];
    let taskStoreForExecutor: TaskStore;
    let taskStoreForHandler: TaskStore;

    if (bucketName) {
      logger.info(`Using GCSTaskStore with bucket: ${bucketName}`);
      const gcsTaskStore = new GCSTaskStore(bucketName);
      taskStoreForExecutor = gcsTaskStore;
      taskStoreForHandler = new NoOpTaskStore(gcsTaskStore);
    } else {
      logger.info('Using InMemoryTaskStore');
      const inMemoryTaskStore = new InMemoryTaskStore();
      taskStoreForExecutor = inMemoryTaskStore;
      taskStoreForHandler = inMemoryTaskStore;
    }

    const agentExecutor = new CoderAgentExecutor(taskStoreForExecutor);

    const context = { config, git, agentExecutor };

    const requestHandler = new DefaultRequestHandler(
      coderAgentCard,
      taskStoreForHandler,
      agentExecutor,
    );

    let expressApp = express();
    expressApp.use((req, res, next) => {
      requestStorage.run({ req }, next);
    });

    const appBuilder = new A2AExpressApp(requestHandler);
    expressApp = appBuilder.setupRoutes(expressApp, '');
    expressApp.use(express.json());

    expressApp.post('/tasks', async (req, res) => {
      try {
        const taskId = uuidv4();
        const agentSettings = req.body.agentSettings as
          | AgentSettings
          | undefined;
        const contextId = req.body.contextId || uuidv4();
        const wrapper = await agentExecutor.createTask(
          taskId,
          contextId,
          agentSettings,
        );
        await taskStoreForExecutor.save(wrapper.toSDKTask());
        res.status(201).json(wrapper.id);
      } catch (error) {
        logger.error('[CoreAgent] Error creating task:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unknown error creating task';
        res.status(500).send({ error: errorMessage });
      }
    });

    expressApp.post('/executeCommand', (req, res) => {
      void handleExecuteCommand(req, res, context);
    });

    expressApp.get('/listCommands', (req, res) => {
      try {
        const transformCommand = (
          command: Command,
          visited: string[],
        ): CommandResponse | undefined => {
          const commandName = command.name;
          if (visited.includes(commandName)) {
            debugLogger.warn(
              `Command ${commandName} already inserted in the response, skipping`,
            );
            return undefined;
          }

          return {
            name: command.name,
            description: command.description,
            arguments: command.arguments ?? [],
            subCommands: (command.subCommands ?? [])
              .map((subCommand) =>
                transformCommand(subCommand, visited.concat(commandName)),
              )
              .filter(
                (subCommand): subCommand is CommandResponse => !!subCommand,
              ),
          };
        };

        const commands = commandRegistry
          .getAllCommands()
          .filter((command) => command.topLevel)
          .map((command) => transformCommand(command, []));

        return res.status(200).json({ commands });
      } catch (e) {
        logger.error('Error executing /listCommands:', e);
        const errorMessage =
          e instanceof Error ? e.message : 'Unknown error listing commands';
        return res.status(500).json({ error: errorMessage });
      }
    });

    expressApp.get('/tasks/metadata', async (req, res) => {
      // This endpoint is only meaningful if the task store is in-memory.
      if (!(taskStoreForExecutor instanceof InMemoryTaskStore)) {
        res.status(501).send({
          error:
            'Listing all task metadata is only supported when using InMemoryTaskStore.',
        });
      }
      try {
        const wrappers = agentExecutor.getAllTasks();
        if (wrappers && wrappers.length > 0) {
          const tasksMetadata = await Promise.all(
            wrappers.map((wrapper) => wrapper.task.getMetadata()),
          );
          res.status(200).json(tasksMetadata);
        } else {
          res.status(204).send();
        }
      } catch (error) {
        logger.error('[CoreAgent] Error getting all task metadata:', error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Unknown error getting task metadata';
        res.status(500).send({ error: errorMessage });
      }
    });

    expressApp.get('/tasks/:taskId/metadata', async (req, res) => {
      const taskId = req.params.taskId;
      let wrapper = agentExecutor.getTask(taskId);
      if (!wrapper) {
        const sdkTask = await taskStoreForExecutor.load(taskId);
        if (sdkTask) {
          wrapper = await agentExecutor.reconstruct(sdkTask);
        }
      }
      if (!wrapper) {
        res.status(404).send({ error: 'Task not found' });
        return;
      }
      res.json({ metadata: await wrapper.task.getMetadata() });
    });

    // 设置会话上下文（用于创建独立的会话工作目录）
    setSessionContext({
      settings,
      extensionLoader: new SimpleExtensionLoader(extensions),
      baseConfig: config,
    });

    // 设置聊天 API 路由
    setupChatRoutes(expressApp, config);

    // 静态文件服务 - 服务前端构建产物（必须在所有 API 路由之后）
    // 从当前文件位置计算项目根目录
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const fs = await import('node:fs');

    // 找到项目根目录（包含 package.json 的目录）
    // 使用原始工作目录，因为 setTargetDir 可能已经改变了 process.cwd()
    let projectRoot = originalCwd;
    // 如果当前目录是 packages/a2a-server，需要回到项目根目录
    if (projectRoot.endsWith('packages/a2a-server')) {
      projectRoot = path.resolve(projectRoot, '../..');
    }
    // 如果原始目录已经是 @projects 或 projects，需要回到项目根目录
    if (projectRoot.endsWith('@projects') || projectRoot.endsWith('projects')) {
      projectRoot = path.resolve(projectRoot, '..');
    }

    // 尝试多个可能的路径（开发模式和构建模式）
    const possiblePaths = [
      // 从项目根目录直接指定（最可靠的方法）
      path.resolve(projectRoot, 'packages/web-ui/dist'),
      // 构建模式：packages/a2a-server/dist/src/http -> ../../../../packages/web-ui/dist
      path.resolve(__dirname, '../../../../packages/web-ui/dist'),
      // 开发模式：packages/a2a-server/src/http -> ../../../packages/web-ui/dist
      path.resolve(__dirname, '../../../packages/web-ui/dist'),
    ];

    let webUiDistPath: string | null = null;
    logger.info(
      `[CoreAgent] Looking for web UI at __dirname: ${__dirname}, cwd: ${process.cwd()}`,
    );
    for (const possiblePath of possiblePaths) {
      logger.info(`[CoreAgent] Checking path: ${possiblePath}`);
      if (fs.existsSync(possiblePath)) {
        webUiDistPath = possiblePath;
        logger.info(`[CoreAgent] Found web UI at: ${webUiDistPath}`);
        break;
      }
    }

    // 检查 web-ui 是否已构建
    if (webUiDistPath && fs.existsSync(webUiDistPath)) {
      const staticPath = webUiDistPath; // 保存为局部变量
      const indexHtmlPath = path.join(staticPath, 'index.html');

      // 静态文件服务（必须在 SPA 回退之前）
      expressApp.use(
        express.static(staticPath, {
          index: false, // 禁用默认的 index.html，我们手动处理
        }),
      );

      // SPA 路由回退 - 所有非 API 和非静态资源的路由返回 index.html
      // 使用中间件方式，在所有路由之后处理
      expressApp.use((req, res, next) => {
        // 只处理 GET 请求
        if (req.method !== 'GET') {
          return next();
        }

        // 跳过 API 路由和 .well-known 路由
        if (
          req.path.startsWith('/api') ||
          req.path.startsWith('/.well-known')
        ) {
          return next();
        }

        // 检查是否是静态资源请求（已有文件扩展名）
        const ext = path.extname(req.path);
        if (ext && ext !== '.html') {
          // 有扩展名但不是 .html，说明是静态资源，让 express.static 处理
          return next();
        }

        // 设置 CSP 响应头（仅对 HTML 页面）
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss: http: https:;",
        );

        // 返回 index.html（SPA 路由）
        res.sendFile(indexHtmlPath, (err) => {
          if (err) {
            logger.error(`[CoreAgent] Error sending index.html: ${err}`);
            if (!res.headersSent) {
              res.status(500).send('Internal Server Error');
            }
          }
        });
      });

      logger.info(`[CoreAgent] Serving web UI from ${staticPath}`);
    } else {
      logger.warn(
        `[CoreAgent] Web UI not found. Checked paths: ${possiblePaths.join(', ')}. Run 'npm run build' in packages/web-ui to build the frontend.`,
      );
      // 即使没有找到 web-ui，也要处理根路径，避免 404
      expressApp.get('/', (req, res) => {
        res
          .status(503)
          .send('Web UI not found. Please build the frontend first.');
      });
    }

    return expressApp;
  } catch (error) {
    logger.error('[CoreAgent] Error during startup:', error);
    process.exit(1);
  }
}

export async function main() {
  try {
    const expressApp = await createApp();
    const port = Number(process.env['CODER_AGENT_PORT'] || 0);

    const server = expressApp.listen(port, 'localhost', () => {
      const address = server.address();
      let actualPort;
      if (process.env['CODER_AGENT_PORT']) {
        actualPort = process.env['CODER_AGENT_PORT'];
      } else if (address && typeof address !== 'string') {
        actualPort = address.port;
      } else {
        throw new Error('[Core Agent] Could not find port number.');
      }
      updateCoderAgentCardUrl(Number(actualPort));
      logger.info(
        `[CoreAgent] Agent Server started on http://localhost:${actualPort}`,
      );
      logger.info(
        `[CoreAgent] Agent Card: http://localhost:${actualPort}/.well-known/agent-card.json`,
      );
      logger.info('[CoreAgent] Press Ctrl+C to stop the server');
    });
  } catch (error) {
    logger.error('[CoreAgent] Error during startup:', error);
    process.exit(1);
  }
}
