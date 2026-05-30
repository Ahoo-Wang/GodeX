import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const enNav = [
  { text: 'Guide', link: '/01-getting-started/overview' },
  { text: 'Architecture', link: '/02-architecture/architecture-overview' },
  { text: 'Providers', link: '/03-provider-development/provider-spec' },
  { text: 'Configuration', link: '/01-getting-started/configuration' },
  { text: 'Diagnostics', link: '/06-error-handling/error-handling' },
  { text: 'Deployment', link: '/09-deployment/deployment' },
  { text: 'GitHub', link: 'https://github.com/Ahoo-Wang/GodeX' },
]

const zhNav = [
  { text: '指南', link: '/zh/01-getting-started/overview' },
  { text: '架构', link: '/zh/02-architecture/architecture-overview' },
  { text: '提供商', link: '/zh/03-provider-development/provider-spec' },
  { text: '配置', link: '/zh/01-getting-started/configuration' },
  { text: '诊断', link: '/zh/06-error-handling/error-handling' },
  { text: '部署', link: '/zh/09-deployment/deployment' },
  { text: 'GitHub', link: 'https://github.com/Ahoo-Wang/GodeX' },
]

const enSidebar = [
  {
    text: 'Onboarding',
    collapsed: true,
    items: [
      { text: 'Contributor Guide', link: '/onboarding/contributor-guide' },
      { text: 'Staff Engineer Guide', link: '/onboarding/staff-engineer-guide' },
      { text: 'Executive Guide', link: '/onboarding/executive-guide' },
      { text: 'Product Manager Guide', link: '/onboarding/product-manager-guide' },
    ],
  },
  {
    text: 'Getting Started',
    collapsed: false,
    items: [
      { text: 'Overview', link: '/01-getting-started/overview' },
      { text: 'Quick Start', link: '/01-getting-started/quick-start' },
      { text: 'Configuration', link: '/01-getting-started/configuration' },
      { text: 'Built-in Providers', link: '/01-getting-started/builtin-providers' },
      { text: 'CLI', link: '/01-getting-started/cli' },
      { text: 'Installation & Setup', link: '/01-getting-started/installation-setup' },
      { text: 'Quick Reference', link: '/01-getting-started/quick-reference' },
    ],
  },
  {
    text: 'Architecture',
    collapsed: false,
    items: [
      { text: 'Architecture Overview', link: '/02-architecture/architecture-overview' },
      { text: 'System Overview', link: '/02-architecture/overview' },
      { text: 'Request Flow', link: '/02-architecture/request-flow' },
      { text: 'Model Resolution', link: '/02-architecture/model-resolution' },
      { text: 'Bridge Kernel', link: '/02-architecture/bridge-kernel' },
      { text: 'Server Routes', link: '/02-architecture/server-routes' },
    ],
  },
  {
    text: 'Bridge Kernel',
    collapsed: true,
    items: [
      { text: 'Compatibility Planning', link: '/02-architecture/compatibility' },
      { text: 'Request Building', link: '/02-architecture/request-building' },
      { text: 'Response Reconstruction', link: '/02-architecture/response-reconstruction' },
      { text: 'Stream Reconstruction', link: '/02-architecture/stream-reconstruction' },
      { text: 'Tool Planning', link: '/02-architecture/tool-planning' },
      { text: 'Output Contracts', link: '/02-architecture/output-contracts' },
    ],
  },
  {
    text: 'Responses Pipeline',
    collapsed: true,
    items: [
      { text: 'Sync Pipeline', link: '/02-architecture/sync-pipeline' },
      { text: 'Streaming Pipeline', link: '/02-architecture/streaming-pipeline' },
      { text: 'Stream Transforms', link: '/02-architecture/stream-transforms' },
    ],
  },
  {
    text: 'Provider Development',
    collapsed: true,
    items: [
      { text: 'Provider Spec', link: '/03-provider-development/provider-spec' },
      { text: 'Provider Hooks', link: '/03-provider-development/provider-hooks' },
      { text: 'Chat Provider Client', link: '/03-provider-development/chat-provider-client' },
      { text: 'Provider Interface', link: '/03-provider-development/provider-interface' },
      { text: 'DeepSeek Reference', link: '/03-provider-development/deepseek-reference' },
      { text: 'MiniMax Reference', link: '/03-provider-development/minimax-reference' },
      { text: 'Zhipu Reference', link: '/03-provider-development/zhipu-reference' },
      { text: 'Xiaomi Reference', link: '/03-provider-development/xiaomi-reference' },
      { text: 'Message & Tool Mapping', link: '/03-provider-development/message-tool-mapping' },
    ],
  },
  {
    text: 'Session Management',
    collapsed: true,
    items: [
      { text: 'Session Stores', link: '/04-session-management/session-stores' },
      { text: 'Chain Resolution', link: '/04-session-management/chain-resolution' },
    ],
  },
  {
    text: 'Streaming Pipeline',
    collapsed: true,
    items: [
      { text: 'Transformers', link: '/05-streaming-pipeline/transformers' },
      { text: 'Stream State', link: '/05-streaming-pipeline/stream-state' },
    ],
  },
  {
    text: 'Error Handling',
    collapsed: true,
    items: [
      { text: 'Error Handling', link: '/06-error-handling/error-handling' },
    ],
  },
  {
    text: 'Configuration',
    collapsed: true,
    items: [
      { text: 'Logging', link: '/07-configuration/logging' },
      { text: 'Config Schema', link: '/07-configuration/config-schema' },
      { text: 'CLI Commands', link: '/07-configuration/cli-commands' },
    ],
  },
 {
   text: 'Testing',
   collapsed: true,
   items: [
     { text: 'Testing', link: '/08-testing/testing' },
   ],
 },
 {
   text: 'Trace',
   collapsed: true,
   items: [
     { text: 'Trace System', link: '/10-trace/trace-system' },
   ],
 },
 {
   text: 'Deployment',
    collapsed: true,
    items: [
      { text: 'Deployment', link: '/09-deployment/deployment' },
      { text: 'CI/CD & Publishing', link: '/09-deployment/ci-cd' },
    ],
  },
]

const zhSidebar = [
  {
    text: '入职指南',
    collapsed: true,
    items: [
      { text: '贡献者指南', link: '/zh/onboarding/contributor-guide' },
      { text: '架构师指南', link: '/zh/onboarding/staff-engineer-guide' },
      { text: '管理者指南', link: '/zh/onboarding/executive-guide' },
      { text: '产品经理指南', link: '/zh/onboarding/product-manager-guide' },
    ],
  },
  {
    text: '快速入门',
    collapsed: false,
    items: [
      { text: '概述', link: '/zh/01-getting-started/overview' },
      { text: '快速开始', link: '/zh/01-getting-started/quick-start' },
      { text: '配置', link: '/zh/01-getting-started/configuration' },
      { text: '内置提供商', link: '/zh/01-getting-started/builtin-providers' },
      { text: 'CLI', link: '/zh/01-getting-started/cli' },
      { text: '安装与配置', link: '/zh/01-getting-started/installation-setup' },
      { text: '快速参考', link: '/zh/01-getting-started/quick-reference' },
    ],
  },
  {
    text: '架构',
    collapsed: false,
    items: [
      { text: '架构概览', link: '/zh/02-architecture/architecture-overview' },
      { text: '系统总览', link: '/zh/02-architecture/overview' },
      { text: '请求流程', link: '/zh/02-architecture/request-flow' },
      { text: '模型解析', link: '/zh/02-architecture/model-resolution' },
      { text: 'Bridge 内核', link: '/zh/02-architecture/bridge-kernel' },
      { text: '服务端路由', link: '/zh/02-architecture/server-routes' },
    ],
  },
  {
    text: 'Bridge 内核',
    collapsed: true,
    items: [
      { text: '兼容性规划', link: '/zh/02-architecture/compatibility' },
      { text: '请求构建', link: '/zh/02-architecture/request-building' },
      { text: '响应重建', link: '/zh/02-architecture/response-reconstruction' },
      { text: '流重建', link: '/zh/02-architecture/stream-reconstruction' },
      { text: '工具规划', link: '/zh/02-architecture/tool-planning' },
      { text: '输出契约', link: '/zh/02-architecture/output-contracts' },
    ],
  },
  {
    text: '响应管道',
    collapsed: true,
    items: [
      { text: '同步管道', link: '/zh/02-architecture/sync-pipeline' },
      { text: '流式管道（详细）', link: '/zh/02-architecture/streaming-pipeline' },
      { text: '流转换', link: '/zh/02-architecture/stream-transforms' },
    ],
  },
  {
    text: '提供商开发',
    collapsed: true,
    items: [
      { text: 'Provider 规范', link: '/zh/03-provider-development/provider-spec' },
      { text: 'Provider 钩子', link: '/zh/03-provider-development/provider-hooks' },
      { text: 'Chat Provider 客户端', link: '/zh/03-provider-development/chat-provider-client' },
      { text: 'Provider 接口', link: '/zh/03-provider-development/provider-interface' },
      { text: 'DeepSeek 参考', link: '/zh/03-provider-development/deepseek-reference' },
      { text: 'MiniMax 参考', link: '/zh/03-provider-development/minimax-reference' },
      { text: '智谱参考实现', link: '/zh/03-provider-development/zhipu-reference' },
      { text: 'Xiaomi 参考', link: '/zh/03-provider-development/xiaomi-reference' },
      { text: '消息与工具映射', link: '/zh/03-provider-development/message-tool-mapping' },
    ],
  },
  {
    text: '会话管理',
    collapsed: true,
    items: [
      { text: '会话存储（多后端）', link: '/zh/04-session-management/session-stores' },
      { text: '链式解析', link: '/zh/04-session-management/chain-resolution' },
    ],
  },
  {
    text: '流式管道',
    collapsed: true,
    items: [
      { text: '转换器', link: '/zh/05-streaming-pipeline/transformers' },
      { text: '流状态', link: '/zh/05-streaming-pipeline/stream-state' },
    ],
  },
  {
    text: '错误处理',
    collapsed: true,
    items: [
      { text: '错误处理', link: '/zh/06-error-handling/error-handling' },
    ],
  },
  {
    text: '配置',
    collapsed: true,
    items: [
      { text: '日志', link: '/zh/07-configuration/logging' },
      { text: '配置 Schema', link: '/zh/07-configuration/config-schema' },
      { text: 'CLI 命令', link: '/zh/07-configuration/cli-commands' },
    ],
  },
  {
    text: '测试',
    collapsed: true,
    items: [
      { text: '测试', link: '/zh/08-testing/testing' },
    ],
  },
  {
    text: '追踪',
    collapsed: true,
    items: [
      { text: '追踪系统', link: '/zh/10-trace/trace-system' },
    ],
  },
  {
    text: '部署',
    collapsed: true,
    items: [
      { text: '部署', link: '/zh/09-deployment/deployment' },
      { text: 'CI/CD 与发布', link: '/zh/09-deployment/ci-cd' },
    ],
  },
]

export default withMermaid(
  defineConfig({
    title: 'GodeX',
    description: 'OpenAI-compatible Responses API gateway for Codex and developer tools',
    appearance: 'dark',
    cleanUrls: true,
    ignoreDeadLinks: true,
    sitemap: {
      hostname: 'https://godex.ahoo.me',
    },
    transformPageData(pageData) {
      const keywords = pageData.frontmatter.keywords
      if (keywords) {
        pageData.frontmatter.head ??= []
        pageData.frontmatter.head.push(['meta', { name: 'keywords', content: keywords }])
      }
    },
    head: [
      ['link', { rel: 'icon', href: '/favicon.ico', sizes: 'any' }],
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
      ['link', { rel: 'manifest', href: '/site.webmanifest' }],
      ['meta', { name: 'theme-color', content: '#0B1220' }],
      ['meta', { name: 'color-scheme', content: 'dark light' }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:title', content: 'GodeX — Make every model a Codex engine' }],
      ['meta', { property: 'og:description', content: 'OpenAI-compatible Responses API gateway for Codex, CLI tools and developer agents.' }],
      ['meta', { property: 'og:image', content: 'https://godex.ahoo.me/og-image.png' }],
      ['meta', { property: 'og:url', content: 'https://godex.ahoo.me' }],
      ['meta', { property: 'og:site_name', content: 'GodeX' }],
      ['meta', { property: 'og:locale', content: 'en_US' }],
      ['meta', { property: 'og:locale:alternate', content: 'zh_CN' }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: 'GodeX — Make every model a Codex engine' }],
      ['meta', { name: 'twitter:description', content: 'OpenAI-compatible Responses API gateway for Codex, CLI tools and developer agents.' }],
      ['meta', { name: 'twitter:image', content: 'https://godex.ahoo.me/og-image.png' }],
      ['script', { type: 'application/ld+json' }, JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "GodeX",
        "description": "OpenAI-compatible Responses API gateway for Codex, CLI tools and developer agents.",
        "url": "https://godex.ahoo.me",
        "applicationCategory": "DeveloperApplication",
        "operatingSystem": "macOS, Linux, Windows",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
        "programmingLanguage": "TypeScript",
      })],
      ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-Q0RBTTN9VG' }],
      ['script', {}, `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-Q0RBTTN9VG');
      `],
      ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
      ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
      ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap' }],
    ],
    markdown: {
      lineNumbers: true,
      theme: {
        dark: 'one-dark-pro',
        light: 'github-light',
      },
    },
    outline: { level: [2, 3] },
    vite: {
      optimizeDeps: { include: ['mermaid'] },
    },
    locales: {
      root: {
        label: 'English',
        lang: 'en',
        themeConfig: {
          nav: enNav,
          sidebar: enSidebar,
          footer: {
            message: 'Released under the <a href="https://opensource.org/licenses/Apache-2.0">Apache-2.0</a> License.',
            copyright: 'Copyright © 2025-present <a href="https://github.com/Ahoo-Wang">Ahoo Wang</a>',
          },
        },
      },
      zh: {
        label: '中文',
        lang: 'zh-CN',
        link: '/zh/',
        themeConfig: {
          nav: zhNav,
          sidebar: zhSidebar,
          footer: {
            message: '基于 <a href="https://opensource.org/licenses/Apache-2.0">Apache-2.0</a> 许可证发布。',
            copyright: 'Copyright © 2025-present <a href="https://github.com/Ahoo-Wang">Ahoo Wang</a>',
          },
        },
      },
    },
    themeConfig: {
      logo: '/logo.svg',
      siteTitle: 'GodeX',
      socialLinks: [
        { icon: 'github', link: 'https://github.com/Ahoo-Wang/GodeX' },
        { icon: 'gitee', link: 'https://gitee.com/AhooWang/GodeX' },
      ],
      search: { provider: 'local' },
    },
    mermaid: {
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: '#0d1117',
        primaryColor: '#2d333b',
        primaryTextColor: '#e6edf3',
        primaryBorderColor: '#6d5dfc',
        secondaryColor: '#1c2333',
        secondaryTextColor: '#e6edf3',
        secondaryBorderColor: '#6d5dfc',
        tertiaryColor: '#161b22',
        tertiaryTextColor: '#e6edf3',
        tertiaryBorderColor: '#30363d',
        lineColor: '#8b949e',
        textColor: '#e6edf3',
        mainBkg: '#2d333b',
        nodeBkg: '#2d333b',
        nodeBorder: '#6d5dfc',
        nodeTextColor: '#e6edf3',
        clusterBkg: '#161b22',
        clusterBorder: '#30363d',
        titleColor: '#e6edf3',
        edgeLabelBackground: '#1c2333',
        actorBkg: '#2d333b',
        actorTextColor: '#e6edf3',
        actorBorder: '#6d5dfc',
        actorLineColor: '#8b949e',
        signalColor: '#e6edf3',
        signalTextColor: '#e6edf3',
        labelBoxBkgColor: '#2d333b',
        labelBoxBorderColor: '#6d5dfc',
        labelTextColor: '#e6edf3',
        loopTextColor: '#e6edf3',
        activationBorderColor: '#6d5dfc',
        activationBkgColor: '#1c2333',
        sequenceNumberColor: '#e6edf3',
        noteBkgColor: '#2d333b',
        noteTextColor: '#e6edf3',
        noteBorderColor: '#6d5dfc',
        classText: '#e6edf3',
        labelColor: '#e6edf3',
        altBackground: '#161b22',
      },
    },
  }),
)
