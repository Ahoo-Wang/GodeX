import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const enNav = [
  { text: 'Getting Started', link: '/01-getting-started/overview' },
  { text: 'Architecture', link: '/02-architecture/overview' },
]

const zhNav = [
  { text: '快速入门', link: '/zh/01-getting-started/overview' },
  { text: '架构', link: '/zh/02-architecture/overview' },
]

const enSidebar = [
  {
    text: 'Onboarding',
    collapsed: false,
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
      { text: 'Installation & Setup', link: '/01-getting-started/installation-setup' },
      { text: 'Quick Reference', link: '/01-getting-started/quick-reference' },
    ],
  },
  {
    text: 'Architecture',
    collapsed: false,
    items: [
      { text: 'System Overview', link: '/02-architecture/overview' },
      { text: 'Request Flow', link: '/02-architecture/request-flow' },
      { text: 'Adapter Pattern', link: '/02-architecture/adapter-pattern' },
      { text: 'Stream Pipeline', link: '/02-architecture/stream-pipeline' },
    ],
  },
  {
    text: 'Provider Development',
    collapsed: false,
    items: [
      { text: 'Provider Interface', link: '/03-provider-development/provider-interface' },
      { text: 'Zhipu Reference', link: '/03-provider-development/zhipu-reference' },
      { text: 'Message & Tool Mapping', link: '/03-provider-development/message-tool-mapping' },
    ],
  },
  {
    text: 'Session Management',
    collapsed: true,
    items: [
      { text: 'Session Store', link: '/04-session-management/session-store' },
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
      { text: 'Error Hierarchy', link: '/06-error-handling/error-hierarchy' },
      { text: 'Error Codes', link: '/06-error-handling/error-codes' },
    ],
  },
  {
    text: 'Configuration',
    collapsed: true,
    items: [
      { text: 'Config Schema', link: '/07-configuration/config-schema' },
      { text: 'CLI Commands', link: '/07-configuration/cli-commands' },
    ],
  },
  {
    text: 'Testing',
    collapsed: true,
    items: [
      { text: 'Testing Guide', link: '/08-testing/testing-guide' },
    ],
  },
  {
    text: 'Deployment',
    collapsed: true,
    items: [
      { text: 'CI/CD & Publishing', link: '/09-deployment/ci-cd' },
    ],
  },
]

const zhSidebar = [
  {
    text: '入门指南',
    collapsed: false,
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
      { text: '安装与配置', link: '/zh/01-getting-started/installation-setup' },
      { text: '快速参考', link: '/zh/01-getting-started/quick-reference' },
    ],
  },
  {
    text: '架构',
    collapsed: false,
    items: [
      { text: '系统总览', link: '/zh/02-architecture/overview' },
      { text: '请求流程', link: '/zh/02-architecture/request-flow' },
      { text: '适配器模式', link: '/zh/02-architecture/adapter-pattern' },
      { text: '流式管道', link: '/zh/02-architecture/stream-pipeline' },
    ],
  },
  {
    text: 'Provider 开发',
    collapsed: false,
    items: [
      { text: 'Provider 接口', link: '/zh/03-provider-development/provider-interface' },
      { text: '智谱参考实现', link: '/zh/03-provider-development/zhipu-reference' },
      { text: '消息与工具映射', link: '/zh/03-provider-development/message-tool-mapping' },
    ],
  },
  {
    text: '会话管理',
    collapsed: true,
    items: [
      { text: '会话存储', link: '/zh/04-session-management/session-store' },
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
      { text: '错误层次', link: '/zh/06-error-handling/error-hierarchy' },
      { text: '错误码', link: '/zh/06-error-handling/error-codes' },
    ],
  },
  {
    text: '配置',
    collapsed: true,
    items: [
      { text: '配置 Schema', link: '/zh/07-configuration/config-schema' },
      { text: 'CLI 命令', link: '/zh/07-configuration/cli-commands' },
    ],
  },
  {
    text: '测试',
    collapsed: true,
    items: [
      { text: '测试指南', link: '/zh/08-testing/testing-guide' },
    ],
  },
  {
    text: '部署',
    collapsed: true,
    items: [
      { text: 'CI/CD 与发布', link: '/zh/09-deployment/ci-cd' },
    ],
  },
]

export default withMermaid(
  defineConfig({
    title: 'Godex Wiki',
    description: 'Technical documentation for Godex — OpenAI Responses API Gateway',
    appearance: 'dark',
    cleanUrls: true,
    ignoreDeadLinks: true,
    sitemap: {
      hostname: "https://godex.ahoo.me",
    },
    head: [
      ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-Q0RBTTN9VG' }],
      ['script', {}, `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', 'G-Q0RBTTN9VG');
      `],
      ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
      ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
      ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap' }],
    ],
    markdown: { lineNumbers: true },
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
        },
      },
      zh: {
        label: '中文',
        lang: 'zh-CN',
        link: '/zh/',
        themeConfig: {
          nav: zhNav,
          sidebar: zhSidebar,
        },
      },
    },
    themeConfig: {
      logo: '/logo.svg',
      siteTitle: 'Godex Wiki',
      socialLinks: [
        { icon: 'github', link: 'https://github.com/Ahoo-Wang/Godex' },
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
