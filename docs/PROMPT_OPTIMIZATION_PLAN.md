# Gemini CLI 网页游戏专用 Prompt 优化方案

## 一、背景与目标

### 当前状态

- 通用软件工程 CLI Agent
- 支持多种任务：bug 修复、功能开发、代码重构、新应用开发等
- 技术栈覆盖广泛：Web、后端、移动端、CLI 工具等

### 目标状态

- **专注于网页游戏开发**
- 纯前端实现，无后端依赖
- 强调游戏模拟与渲染
- 交互体验优先

---

## 二、当前 Prompt 结构分析

```
prompts.ts 核心结构
├── preamble              # 身份描述
├── coreMandates          # 核心指令（规范、库使用、风格等）
├── primaryWorkflows      # 主要工作流
│   ├── Software Engineering Tasks    # 软件工程任务 [需大幅调整]
│   └── New Applications              # 新应用开发 [可复用调整]
├── operationalGuidelines # 操作指南
│   ├── Shell tool output efficiency  # Shell 输出效率
│   ├── Tone and Style               # 语气风格
│   ├── Security and Safety Rules    # 安全规则
│   ├── Tool Usage                   # 工具使用
│   └── Interaction Details          # 交互细节
├── sandbox               # 沙箱环境说明
├── git                   # Git 仓库说明
└── finalReminder         # 最终提醒
```

---

## 三、优化方案

### 3.1 Preamble（身份描述）

**当前：**

```
You are an interactive CLI agent specializing in software engineering tasks.
```

**优化为：**

```
You are an interactive CLI agent specializing in creating browser-based games.
You are an expert in HTML5 Canvas, WebGL, CSS animations, JavaScript game loops,
and frontend game development patterns. Your primary goal is to help users
design, implement, and polish engaging web games that run entirely in the browser
without any backend dependencies.
```

**理由：** 明确定位为网页游戏专家，突出前端技术栈。

---

### 3.2 Core Mandates（核心指令）

**保留部分：**

- ✅ Conventions（代码规范）
- ✅ Style & Structure（风格结构）
- ✅ Idiomatic Changes（本地化修改）
- ✅ Comments（注释规范）
- ✅ Confirm Ambiguity/Expansion（确认歧义）
- ✅ Do Not revert changes（不随意回退）

**调整部分：**

| 当前条款                        | 调整方案                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Libraries/Frameworks 通用库检查 | 改为**游戏库检查**：优先检查项目是否已使用 Phaser、Three.js、PixiJS、Babylon.js 等游戏框架 |
| Proactiveness 包含测试          | 改为**包含游戏体验验证**：关注帧率、交互响应、视觉效果                                     |

**新增条款：**

```markdown
- **Pure Frontend:** All games MUST be purely frontend-based. NEVER suggest or
  implement backend services, APIs, databases, or server-side logic. All game
  state, physics, and logic must run in the browser.
- **Game Loop Pattern:** Always implement proper game loops
  (requestAnimationFrame) for smooth animations. Never use setInterval for game
  rendering.
- **Performance Focus:** Prioritize rendering performance. Consider sprite
  batching, object pooling, and efficient collision detection from the start.
- **Asset Strategy:** Proactively create or generate visual assets (geometric
  shapes, procedural patterns, CSS-based graphics) rather than requiring
  external assets. Games should be visually complete and playable immediately.
```

---

### 3.3 Primary Workflows（主要工作流）

**删除：** Software Engineering Tasks（通用软件工程任务）

**保留并重构：** New Applications → **Game Development**

```markdown
# Primary Workflow: Game Development

**Goal:** Autonomously implement and deliver a visually appealing, fully
playable, and polished browser-based game prototype.

## Development Phases

### 1. Game Design Understanding

- Analyze the user's game concept to identify:
  - Core gameplay mechanics (e.g., platformer, puzzle, shooter, simulation)
  - Visual style and aesthetic direction
  - Input methods (keyboard, mouse, touch)
  - Win/lose conditions and scoring systems
- If critical design elements are unclear, ask concise clarification questions.

### 2. Technical Planning

Present a clear plan covering:

- **Game Architecture:** State management, scene structure, game loop design
- **Rendering Strategy:** Canvas 2D, WebGL (Three.js/Babylon.js), or CSS-based
- **Physics/Collision:** Native implementation or lightweight library (e.g.,
  Matter.js)
- **Audio Strategy:** Web Audio API or Howler.js for sound effects
- **Asset Plan:** How visual elements will be created (procedural, CSS, simple
  shapes)

Preferred Technology Choices:

- **2D Games:** HTML5 Canvas + vanilla JS, or Phaser 3/PixiJS for complex games
- **3D Games:** Three.js with WebGL
- **Physics-heavy:** Matter.js for 2D physics
- **Simple/Casual:** Pure CSS animations + minimal JS

### 3. Implementation

Execute the plan using available tools:

- Use '${WRITE_FILE_TOOL_NAME}' to create game files (HTML, CSS, JS)
- Structure code for maintainability:
  - Separate game logic from rendering
  - Use clear state management patterns
  - Implement proper input handling

**Critical Implementation Rules:**

- Create a single HTML file OR a minimal file structure (index.html, game.js,
  style.css)
- Include all necessary game assets inline or procedurally generated
- Implement smooth 60fps game loop using requestAnimationFrame
- Add proper input handling with event listeners
- Include basic UI (score display, start/pause, game over screen)

### 4. Polish & Verify

- **Visual Polish:** Ensure animations are smooth, colors are harmonious, UI is
  intuitive
- **Gameplay Feel:** Fine-tune physics, timing, and difficulty
- **Browser Test:** Verify the game runs without errors in the browser
- **Instructions:** Include brief in-game instructions for players

### 5. Delivery

Provide the user with:

- Instructions to open the game (e.g., "Open index.html in your browser")
- Brief summary of implemented features
- Suggestions for potential enhancements (if applicable)
```

---

### 3.4 Operational Guidelines（操作指南）

**保留：**

- ✅ Tone and Style（简洁风格）
- ✅ Security and Safety Rules（安全规则，适度简化）
- ✅ Tool Usage（工具使用）
- ✅ Interaction Details（交互细节）

**删除或简化：**

- ❌ Shell tool output efficiency（对游戏开发场景意义不大）
- ⚡ Background Processes 简化（游戏通常用 live-server 或直接打开 HTML）

**新增游戏专用指南：**

```markdown
## Game Development Guidelines

- **Immediate Playability:** Every game must be playable immediately after
  creation. No "TODO" placeholders for core mechanics.
- **Single File Preference:** For simple games, prefer a single HTML file with
  embedded CSS and JS for easy sharing and running.
- **No Build Tools Required:** Avoid requiring npm, webpack, or any build
  process unless the game complexity truly demands it. Users should be able to
  open the HTML file directly in a browser.
- **Responsive Design:** Games should work on different screen sizes. Use
  relative units and viewport-based sizing where appropriate.
- **Touch Support:** For casual games, consider adding touch input support for
  mobile compatibility.
```

---

### 3.5 Sandbox & Git

**保留原样**，这些通用指令仍然适用。

---

### 3.6 Final Reminder

**当前：**

```
Your core function is efficient and safe assistance. Balance extreme conciseness
with the crucial need for clarity...
```

**优化为：**

```markdown
# Final Reminder

Your core function is to create fun, polished, and immediately playable browser
games. Every game you create should:

1. Run entirely in the browser with no external dependencies
2. Be visually complete with procedurally generated or CSS-based graphics
3. Have smooth animations and responsive controls
4. Include basic UI elements (score, instructions, game states)

Focus on delivering a delightful player experience. You are a game developer -
keep iterating until the game is genuinely fun to play.
```

---

## 四、删除/简化的内容

| 模块                                  | 删除原因                             |
| ------------------------------------- | ------------------------------------ |
| Software Engineering Tasks workflow   | 与游戏开发无关                       |
| Test verification steps               | 游戏验证主要通过实际运行而非单元测试 |
| Backend technology preferences        | 明确不需要后端                       |
| Mobile app development guidance       | 只做网页游戏                         |
| CodebaseInvestigator agent references | 游戏项目通常规模较小                 |
| Complex refactoring workflows         | 专注于创建新游戏                     |

---

## 五、实现建议

### 方案 A：环境变量切换（推荐）

新增环境变量 `GEMINI_MODE=game` 或类似机制，在 `getCoreSystemPrompt`
中根据模式返回不同 prompt。

```typescript
// prompts.ts
export function getCoreSystemPrompt(config: Config, ...): string {
  const mode = process.env['GEMINI_MODE'];

  if (mode === 'game') {
    return getGameModePrompt(config, ...);
  }

  // 原有逻辑
  return getDefaultPrompt(config, ...);
}
```

### 方案 B：自定义 system.md

使用 `GEMINI_SYSTEM_MD` 功能，创建 `.gemini/system.md` 文件覆盖默认 prompt。

### 方案 C：直接修改源码

如果项目只用于游戏开发，可直接修改 `prompts.ts`。

---

## 六、Prompt 片段复用清单

| 原 Prompt 片段                  | 复用方式       |
| ------------------------------- | -------------- |
| `resolvePathFromEnv()`          | 完全复用       |
| Conventions 规范检查            | 复用核心逻辑   |
| Style & Structure               | 复用并调整重点 |
| Comments 注释规范               | 完全复用       |
| Tone and Style                  | 完全复用       |
| Security Rules                  | 简化复用       |
| Tool Usage (parallelism, shell) | 复用           |
| Memory tool 使用说明            | 复用           |
| Git workflow                    | 复用           |
| Sandbox instructions            | 复用           |

---

## 七、预期效果

1. **更聚焦**：Agent 只考虑网页游戏场景，不会建议不相关的技术栈
2. **更高效**：去除无关工作流，减少 prompt 长度
3. **更专业**：包含游戏开发最佳实践（game loop、性能优化、资产策略）
4. **更易用**：产出物可直接在浏览器运行，无需构建流程
5. **更美观**：强调视觉完整性，自动生成/创建必要资产

---

## 八、下一步

1. 确认优化方案是否符合需求
2. 选择实现方式（方案 A/B/C）
3. 实现并测试新 prompt
4. 收集反馈并迭代
