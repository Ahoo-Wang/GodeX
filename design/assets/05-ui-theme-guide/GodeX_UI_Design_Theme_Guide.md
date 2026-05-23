# GodeX UI 设计主题规范

## 1. 品牌定位

**GodeX** 是面向开发者与 AI 工具链的 OpenAI-compatible Responses API Gateway。它通过兼容 OpenAI Responses API 的网关能力，将 Codex、CLI、IDE、自动化开发工具与不同模型供应商连接起来，让每个模型都能成为 Codex 引擎。

主 slogan：

> **Make every model a Codex engine.**

副标题：

> **OpenAI-compatible Responses API gateway.**

中文表达：

> **让每个模型都成为 Codex 引擎。**  
> **通过 OpenAI 兼容的 Responses API 网关连接任意模型。**

核心关键词：**Code / Gateway / Routing / AI**。

---

## 2. 设计主题

主题名称：**Protocol Gateway UI**

副主题：**Developer-first, model-agnostic, streaming-native.**

GodeX 的 UI 应避免泛 AI 营销感，整体偏向工程级、可信、清晰、速度感、开放协议感。

视觉关键词：

- **精密**：布局、间距、线条与信息层级高度克制。
- **低延迟**：通过数据流、SSE、连接线表达流式能力。
- **可扩展**：用节点、网关、适配器、协议层表达扩展能力。
- **开放**：强调透明协议、配置、可观测性。
- **开发者友好**：代码片段、终端、配置面板、日志流是核心视觉元素。

---

## 3. 色彩系统

| Token | 色值 | 用途 |
|---|---:|---|
| `--gx-bg-deep` | `#0B1220` | 深色背景、Hero、终端区域 |
| `--gx-bg-panel` | `#112240` | 深色卡片、侧边栏、浮层 |
| `--gx-blue` | `#2563FF` | 主按钮、链接、高亮状态 |
| `--gx-cyan` | `#00D4FF` | 流式、连接、成功的技术高亮 |
| `--gx-purple` | `#7C3AED` | 模型、AI、智能路由强调 |
| `--gx-violet` | `#A855F7` | Logo 渐变终点、装饰性强调 |
| `--gx-slate` | `#94A3B8` | 次级文本、说明文字 |
| `--gx-border` | `#E6ECF5` | 浅色边框、分隔线 |
| `--gx-bg-light` | `#F8FAFC` | 官网浅色区块背景 |
| `--gx-text` | `#0F172A` | 主文本 |

品牌渐变：

```css
background: linear-gradient(135deg, #00D4FF 0%, #2563FF 45%, #7C3AED 100%);
```

深色 Hero 背景：

```css
background:
  radial-gradient(circle at 20% 20%, rgba(37, 99, 255, 0.22), transparent 32%),
  radial-gradient(circle at 80% 30%, rgba(124, 58, 237, 0.18), transparent 28%),
  linear-gradient(180deg, #0B1220 0%, #08101D 100%);
```

推荐使用比例：深蓝 / 白色背景 70%，中性灰 15%，蓝色主色 8%，青紫强调 7%。

---

## 4. 字体与排版

官网与应用 UI：

```css
font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

代码、终端、配置：

```css
font-family: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
```

中文环境：

```css
font-family: Inter, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
```

推荐字号：Hero 标题 56-72px，Section 标题 32-44px，正文 15-17px，代码 13-15px。

---

## 5. Logo 使用规则

品牌名称统一使用：**GodeX**。`X` 保持大写，表达 eXtensible、Cross-model、Protocol exchange、Gateway crossing point。

推荐维护版本：

1. 横版主 Logo：官网 Header、README、社交图、品牌展示。
2. 深色背景 Logo：Hero、CLI、暗色应用界面。
3. 图标版：favicon、App icon、文档侧边栏。
4. 黑白版：打印、单色场景、低对比限制场景。
5. 无副标题版：小尺寸导航和工具栏。
6. 带副标题版：首页 Hero、品牌封面、README 顶部。

Logo 小字建议使用：**OPENAI-COMPATIBLE RESPONSES API GATEWAY**。完整 slogan 不建议放在 logo 下方。

最小尺寸：favicon 保留 X + Gateway 轮廓；文档侧边栏图标 32px 或 40px；Header 横版 Logo 高度 28-36px；App Icon 输出 512px / 1024px。

---

## 6. 官网设计规范

官网首屏应在 5 秒内回答：GodeX 是什么、解决什么问题、如何快速开始。

首屏推荐文案：

```text
Make every model a Codex engine.
OpenAI-compatible Responses API gateway.
```

中文站首屏：

```text
让每个模型都成为 Codex 引擎。
通过 OpenAI 兼容的 Responses API 网关连接任意模型。
```

首页结构建议：

1. **Hero**：主标题、副标题、Get Started / GitHub、终端示例、协议转换图。
2. **Protocol Translation**：展示 `/v1/responses` 到上游 Chat Completions 的转换路径。
3. **Provider-agnostic**：展示 Provider adapters，避免暗示官方合作。
4. **Streaming-first**：展示 SSE 流式日志、ReadableStream / TransformStream。
5. **Session History**：展示 `previous_response_id` 链路与存储后端。
6. **Structured Errors & Logs**：展示请求 ID、诊断上下文、错误码。
7. **Standalone Binary**：展示 zero runtime dependencies / native binary / CI builds。
8. **Quickstart**：安装、配置、启动、Codex 接入。

Hero 右侧建议视觉：

```text
Codex / CLI / IDE
        ↓
/v1/responses
        ↓
GodeX Gateway
        ↓
Provider Adapter
        ↓
Any Model API
```

---

## 7. 文档站设计规范

文档站目标：快速定位、低认知负担、配置可复制、错误可排查。

一级导航建议：Quickstart、Configuration、Providers、Responses API Compatibility、Streaming & SSE、Session History、Error Codes、Deployment、CLI Reference、Architecture。

正文要求：

- 每页开头给出“适用场景”。
- 命令示例必须可复制。
- 配置示例提供完整 JSON/YAML/env 片段。
- 错误说明必须包含原因、影响、解决方案。

---

## 8. 应用 UI / 控制台设计规范

如果 GodeX 后续提供 Web Console，建议采用深浅双主题 + 开发者仪表盘。

主导航建议：

```text
Overview / Requests / Sessions / Providers / Models / Routing / Logs / Errors / Settings
```

Dashboard 展示：Gateway status、Requests per minute、Average latency、Streaming success rate、Active providers、Error rate、Recent requests、Recent structured errors。

Requests 页面字段：Time、Request ID、Model、Provider、Route、Status、Latency、Stream、Tokens、Error Code。

请求详情结构：

```text
Request Summary
↓
Input Payload
↓
Protocol Transform
↓
Provider Adapter
↓
Streaming Events
↓
Final Response
↓
Diagnostics
```

Routing 页面建议规则卡：

```text
When model matches "glm-*"
Route to provider "zhipu"
Transform via "openai-chat-compatible"
Fallback to "openrouter" after 2 retries
```

Logs 页面建议支持：level、request_id、provider、error_code 过滤；复制 JSON 行；NDJSON 视图；Trace-like 展示。

---

## 9. 组件规范

主按钮：蓝色背景，hover 使用品牌渐变，圆角 10-12px，字重 600。

浅色卡片：

```css
.gx-card-light {
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid #E6ECF5;
  border-radius: 20px;
  box-shadow: 0 16px 48px rgba(15, 23, 42, 0.08);
}
```

深色卡片：

```css
.gx-card-dark {
  background: rgba(17, 34, 64, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(18px);
}
```

状态颜色：Running `#22C55E`，Streaming `#00D4FF`，Degraded `#F59E0B`，Failed `#EF4444`，Disabled `#64748B`。

---

## 10. CLI / 开发者体验规范

终端示例：

```bash
$ godex

GodeX is running. Listening on http://localhost:5678
→ Responses API: /v1/responses
→ Upstream: Chat Completions compatible provider
```

CLI 品牌化原则：不要过多输出 ASCII Art；启动时可以使用单行 GodeX wordmark；日志必须便于复制与搜索；错误信息结构化。

---

## 11. 可访问性规范

- 正文文本对比度满足 WCAG AA。
- 深色背景上的灰色文字不要低于 `#CBD5E1`。
- 蓝紫渐变文字只用于大标题，不用于小字正文。
- 所有按钮、链接、输入框必须有明显 focus ring。
- 状态不能只依赖颜色，应搭配文案或图标。
- 代码块支持键盘访问、复制与横向滚动。

---

## 12. 最终设计原则

GodeX 的 UI 不只是“好看”，而要让开发者感到：

1. **我知道它在做什么**：协议转换路径清晰可见。
2. **我能快速接入**：Quickstart 与配置复制友好。
3. **我能排查问题**：日志、错误码、请求链路透明。
4. **我能扩展它**：Provider、Model、Routing、Adapter 结构明确。
5. **我信任它**：视觉克制、文案准确、交互稳定。

一句话总结：

> GodeX 的品牌官网负责建立信任，文档站负责降低接入成本，应用 UI 负责让协议网关透明可控。
