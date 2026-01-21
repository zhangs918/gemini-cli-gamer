/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import * as dotenv from 'dotenv';

import type { TelemetryTarget } from '@google/gemini-cli-core';
import {
  AuthType,
  Config,
  type ConfigParameters,
  FileDiscoveryService,
  ApprovalMode,
  createPolicyEngineConfig,
  type PolicySettings,
  loadServerHierarchicalMemory,
  GEMINI_DIR,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_GEMINI_MODEL,
  type ExtensionLoader,
  startupProfiler,
  PREVIEW_GEMINI_MODEL,
  homedir,
} from '@google/gemini-cli-core';

import { logger } from '../utils/logger.js';
import type { Settings } from './settings.js';
import { type AgentSettings, CoderAgentEvent } from '../types.js';

/**
 * 生成 8 位随机字符（小写字母和数字）
 */
function generateRandomId(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 查找项目根目录（包含 package.json 的目录）
 */
function findProjectRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);
  while (true) {
    // 检查是否存在 package.json（项目根目录的标志）
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      // 进一步验证：检查是否有 packages 目录（monorepo 结构）
      const packagesDir = path.join(currentDir, 'packages');
      if (fs.existsSync(packagesDir)) {
        return currentDir;
      }
    }

    // 检查是否是 packages/a2a-server 目录，如果是，向上两级
    if (currentDir.endsWith('packages/a2a-server')) {
      return path.resolve(currentDir, '../..');
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // 到达文件系统根目录，返回当前目录作为后备
      break;
    }
    currentDir = parentDir;
  }
  // 如果找不到，返回起始目录的父目录（至少回到项目根目录的近似位置）
  return path.resolve(startDir, '../..');
}

/**
 * 获取 @projects 目录路径
 * 不依赖于当前工作目录，而是基于文件系统结构查找项目根目录
 */
export function getProjectsBaseDir(): string {
  // 从当前文件位置开始查找项目根目录
  // 使用 import.meta.url 获取当前文件的路径
  const currentFileDir = path.dirname(url.fileURLToPath(import.meta.url));
  let startDir = currentFileDir;

  // 如果是构建后的文件，路径会是 dist/src/config
  // 如果是源码文件，路径会是 src/config
  if (currentFileDir.includes('dist')) {
    // 构建模式：dist/src/config -> 项目根目录
    startDir = path.resolve(currentFileDir, '../../../..');
  } else {
    // 开发模式：src/config -> 项目根目录
    startDir = path.resolve(currentFileDir, '../../..');
  }

  const projectRoot = findProjectRoot(startDir);
  const atProjectsDir = path.resolve(projectRoot, '@projects');

  // 始终返回 @projects 目录（即使不存在，后续 createSessionWorkDir 会创建）
  logger.info(
    `[Config] Project root: ${projectRoot}, @projects dir: ${atProjectsDir}`,
  );
  return atProjectsDir;
}

/**
 * 为新会话创建专用工作目录
 * 在 @projects 下创建一个 8 位随机字符命名的文件夹
 */
export function createSessionWorkDir(): string {
  const baseDir = getProjectsBaseDir();
  const sessionDirName = generateRandomId(8);
  const sessionDir = path.resolve(baseDir, sessionDirName);

  // 确保 @projects 目录存在
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
    logger.info(`[Config] Created projects base directory: ${baseDir}`);
  }

  // 创建会话目录
  fs.mkdirSync(sessionDir, { recursive: true });
  logger.info(`[Config] Created session work directory: ${sessionDir}`);

  return sessionDir;
}

/**
 * 为会话创建独立的 Config 实例
 */
export async function createSessionConfig(
  settings: Settings,
  extensionLoader: ExtensionLoader,
  sessionId: string,
  workspaceDir: string,
): Promise<Config> {
  const adcFilePath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

  const folderTrust =
    settings.folderTrust === true ||
    process.env['GEMINI_FOLDER_TRUST'] === 'true';

  const configParams: ConfigParameters = {
    sessionId,
    model: settings.general?.previewFeatures
      ? PREVIEW_GEMINI_MODEL
      : DEFAULT_GEMINI_MODEL,
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
    sandbox: undefined,
    targetDir: workspaceDir,
    debugMode: process.env['DEBUG'] === 'true' || false,
    question: '',

    coreTools: settings.coreTools || undefined,
    excludeTools: settings.excludeTools || undefined,
    showMemoryUsage: settings.showMemoryUsage || false,
    approvalMode:
      process.env['GEMINI_YOLO_MODE'] === 'true'
        ? ApprovalMode.YOLO
        : ApprovalMode.DEFAULT,
    mcpServers: settings.mcpServers,
    cwd: workspaceDir,
    telemetry: {
      enabled: settings.telemetry?.enabled,
      target: settings.telemetry?.target as TelemetryTarget,
      otlpEndpoint:
        process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
        settings.telemetry?.otlpEndpoint,
      logPrompts: settings.telemetry?.logPrompts,
    },
    fileFiltering: {
      respectGitIgnore: settings.fileFiltering?.respectGitIgnore,
      enableRecursiveFileSearch:
        settings.fileFiltering?.enableRecursiveFileSearch,
    },
    ideMode: false,
    folderTrust,
    trustedFolder: true,
    extensionLoader,
    checkpointing: process.env['CHECKPOINTING']
      ? process.env['CHECKPOINTING'] === 'true'
      : settings.checkpointing?.enabled,
    previewFeatures: settings.general?.previewFeatures,
    interactive: true,
    enableInteractiveShell: true,
  };

  // Build PolicyEngineConfig
  const policySettings: PolicySettings = {
    mcpServers: settings.mcpServers,
    tools: {
      exclude: settings.excludeTools,
    },
  };
  configParams.policyEngineConfig = await createPolicyEngineConfig(
    policySettings,
    configParams.approvalMode ?? ApprovalMode.DEFAULT,
  );

  const fileService = new FileDiscoveryService(workspaceDir);
  const { memoryContent, fileCount, filePaths } =
    await loadServerHierarchicalMemory(
      workspaceDir,
      [workspaceDir],
      false,
      fileService,
      extensionLoader,
      folderTrust,
    );
  configParams.userMemory = memoryContent;
  configParams.geminiMdFileCount = fileCount;
  configParams.geminiMdFilePaths = filePaths;

  const config = new Config({
    ...configParams,
  });
  await config.initialize();

  // 设置认证
  if (process.env['USE_CCPA']) {
    logger.info('[Config] Session using CCPA Auth');
    if (adcFilePath) {
      path.resolve(adcFilePath);
    }
    await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
  } else if (process.env['GEMINI_API_KEY']) {
    logger.info('[Config] Session using Gemini API Key');
    await config.refreshAuth(AuthType.USE_GEMINI);
  } else {
    throw new Error(
      '[Config] Unable to set GeneratorConfig. Please provide a GEMINI_API_KEY or set USE_CCPA.',
    );
  }

  // 启用 YOLO 模式
  try {
    config.setApprovalMode(ApprovalMode.YOLO);
    logger.info(
      `[Config] Session ${sessionId}: YOLO mode enabled, workDir: ${workspaceDir}`,
    );
  } catch (error) {
    logger.warn('[Config] Could not set YOLO mode:', error);
  }

  return config;
}

export async function loadConfig(
  settings: Settings,
  extensionLoader: ExtensionLoader,
  taskId: string,
): Promise<Config> {
  const workspaceDir = process.cwd();
  const adcFilePath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];

  const folderTrust =
    settings.folderTrust === true ||
    process.env['GEMINI_FOLDER_TRUST'] === 'true';

  const configParams: ConfigParameters = {
    sessionId: taskId,
    model: settings.general?.previewFeatures
      ? PREVIEW_GEMINI_MODEL
      : DEFAULT_GEMINI_MODEL,
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
    sandbox: undefined, // Sandbox might not be relevant for a server-side agent
    targetDir: workspaceDir, // Or a specific directory the agent operates on
    debugMode: process.env['DEBUG'] === 'true' || false,
    question: '', // Not used in server mode directly like CLI

    coreTools: settings.coreTools || undefined,
    excludeTools: settings.excludeTools || undefined,
    showMemoryUsage: settings.showMemoryUsage || false,
    approvalMode:
      process.env['GEMINI_YOLO_MODE'] === 'true'
        ? ApprovalMode.YOLO
        : ApprovalMode.DEFAULT,
    mcpServers: settings.mcpServers,
    cwd: workspaceDir,
    telemetry: {
      enabled: settings.telemetry?.enabled,
      target: settings.telemetry?.target as TelemetryTarget,
      otlpEndpoint:
        process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ??
        settings.telemetry?.otlpEndpoint,
      logPrompts: settings.telemetry?.logPrompts,
    },
    // Git-aware file filtering settings
    fileFiltering: {
      respectGitIgnore: settings.fileFiltering?.respectGitIgnore,
      enableRecursiveFileSearch:
        settings.fileFiltering?.enableRecursiveFileSearch,
    },
    ideMode: false,
    folderTrust,
    trustedFolder: true,
    extensionLoader,
    checkpointing: process.env['CHECKPOINTING']
      ? process.env['CHECKPOINTING'] === 'true'
      : settings.checkpointing?.enabled,
    previewFeatures: settings.general?.previewFeatures,
    interactive: true,
    enableInteractiveShell: true,
  };

  // Build PolicyEngineConfig to load default TOML policies (including yolo.toml)
  const policySettings: PolicySettings = {
    mcpServers: settings.mcpServers,
    tools: {
      exclude: settings.excludeTools,
    },
  };
  configParams.policyEngineConfig = await createPolicyEngineConfig(
    policySettings,
    configParams.approvalMode ?? ApprovalMode.DEFAULT,
  );

  const fileService = new FileDiscoveryService(workspaceDir);
  const { memoryContent, fileCount, filePaths } =
    await loadServerHierarchicalMemory(
      workspaceDir,
      [workspaceDir],
      false,
      fileService,
      extensionLoader,
      folderTrust,
    );
  configParams.userMemory = memoryContent;
  configParams.geminiMdFileCount = fileCount;
  configParams.geminiMdFilePaths = filePaths;
  const config = new Config({
    ...configParams,
  });
  // Needed to initialize ToolRegistry, and git checkpointing if enabled
  await config.initialize();
  startupProfiler.flush(config);

  if (process.env['USE_CCPA']) {
    logger.info('[Config] Using CCPA Auth:');
    try {
      if (adcFilePath) {
        path.resolve(adcFilePath);
      }
    } catch (e) {
      logger.error(
        `[Config] USE_CCPA env var is true but unable to resolve GOOGLE_APPLICATION_CREDENTIALS file path ${adcFilePath}. Error ${e}`,
      );
    }
    await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
    logger.info(
      `[Config] GOOGLE_CLOUD_PROJECT: ${process.env['GOOGLE_CLOUD_PROJECT']}`,
    );
  } else if (process.env['GEMINI_API_KEY']) {
    logger.info('[Config] Using Gemini API Key');
    await config.refreshAuth(AuthType.USE_GEMINI);
  } else {
    const errorMessage =
      '[Config] Unable to set GeneratorConfig. Please provide a GEMINI_API_KEY or set USE_CCPA.';
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  return config;
}

export function setTargetDir(agentSettings: AgentSettings | undefined): string {
  const originalCWD = process.cwd();
  const targetDir =
    process.env['CODER_AGENT_WORKSPACE_PATH'] ??
    (agentSettings?.kind === CoderAgentEvent.StateAgentSettingsEvent
      ? agentSettings.workspacePath
      : undefined);

  if (!targetDir) {
    // 默认使用项目根目录下的 @projects 文件夹
    const defaultDir = getProjectsBaseDir();

    // 如果默认目录存在，使用它；否则使用原始工作目录
    if (fs.existsSync(defaultDir)) {
      logger.info(
        `[CoderAgentExecutor] Using default workspace directory: ${defaultDir}`,
      );
      try {
        process.chdir(defaultDir);
        return defaultDir;
      } catch (e) {
        logger.warn(
          `[CoderAgentExecutor] Error changing to default workspace directory: ${e}, using original cwd`,
        );
        return originalCWD;
      }
    }

    // 如果 @projects 不存在，使用原始工作目录
    return originalCWD;
  }

  logger.info(
    `[CoderAgentExecutor] Overriding workspace path to: ${targetDir}`,
  );

  try {
    const resolvedPath = path.resolve(targetDir);
    process.chdir(resolvedPath);
    return resolvedPath;
  } catch (e) {
    logger.error(
      `[CoderAgentExecutor] Error resolving workspace path: ${e}, returning original os.cwd()`,
    );
    return originalCWD;
  }
}

export function loadEnvironment(): void {
  const envFilePath = findEnvFile(process.cwd());
  if (envFilePath) {
    dotenv.config({ path: envFilePath, override: true });
  }
}

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    // prefer gemini-specific .env under GEMINI_DIR
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) {
      return geminiEnvPath;
    }
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      // check .env under home as fallback, again preferring gemini-specific .env
      const homeGeminiEnvPath = path.join(process.cwd(), GEMINI_DIR, '.env');
      if (fs.existsSync(homeGeminiEnvPath)) {
        return homeGeminiEnvPath;
      }
      const homeEnvPath = path.join(homedir(), '.env');
      if (fs.existsSync(homeEnvPath)) {
        return homeEnvPath;
      }
      return null;
    }
    currentDir = parentDir;
  }
}
