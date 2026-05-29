import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";

const config = defineConfig({
	srcDir: ".",
	title: "GodeX",
	description:
		"Make every model a Codex engine through an OpenAI-compatible Responses API gateway",
	lang: "en-US",
	cleanUrls: true,
	lastUpdated: true,
	head: [
		["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }],
	],
	themeConfig: {
		logo: "/logo.svg",
		siteTitle: "GodeX",
		nav: [
			{ text: "Guide", link: "/01-getting-started/overview" },
			{ text: "Architecture", link: "/02-architecture/architecture" },
			{ text: "Bridge Kernel", link: "/03-bridge-kernel/bridge-kernel" },
		],
		sidebar: [
			{
				text: "Onboarding",
				collapsed: false,
				items: [
					{
						text: "Contributor Guide",
						link: "/onboarding/contributor/contributor-guide",
					},
					{
						text: "Staff Engineer Guide",
						link: "/onboarding/staff-engineer/staff-engineer-guide",
					},
					{
						text: "Executive Guide",
						link: "/onboarding/executive/executive-guide",
					},
					{
						text: "Product Manager Guide",
						link: "/onboarding/product-manager/product-manager-guide",
					},
				],
			},
			{
				text: "Getting Started",
				collapsed: false,
				items: [
					{
						text: "Overview",
						link: "/01-getting-started/overview",
					},
					{
						text: "Quick Start",
						link: "/01-getting-started/quick-start",
					},
					{
						text: "CLI Reference",
						link: "/01-getting-started/cli-reference",
					},
				],
			},
			{
				text: "Deep Dive",
				collapsed: true,
				items: [
					{
						text: "Architecture",
						link: "/02-architecture/architecture",
					},
					{
						text: "Bridge Kernel",
						link: "/03-bridge-kernel/bridge-kernel",
					},
					{
						text: "Provider Development",
						link: "/04-provider-development/provider-development",
					},
					{
						text: "Streaming Pipeline",
						link: "/05-streaming-pipeline/streaming-pipeline",
					},
					{
						text: "Session Management",
						link: "/06-session-management/session-management",
					},
					{
						text: "Configuration",
						link: "/07-configuration/configuration",
					},
					{
						text: "Trace & Observability",
						link: "/08-trace-observability/trace-observability",
					},
					{
						text: "Error Handling",
						link: "/09-error-handling/error-handling",
					},
				],
			},
		],
		socialLinks: [
			{
				icon: "github",
				link: "https://github.com/Ahoo-Wang/GodeX",
			},
		],
		footer: {
			message:
				'Released under the <a href="https://github.com/Ahoo-Wang/GodeX/blob/main/LICENSE">Apache-2.0 License</a>.',
			copyright: "Copyright 2025 Ahoo Wang",
		},
		search: {
			provider: "local",
		},
		editLink: {
			pattern:
				"https://github.com/Ahoo-Wang/GodeX/edit/wiki/wiki/:path",
			text: "Edit this page on GitHub",
		},
	},
	mermaid: {
		theme: "dark",
		themeVariables: {
			primaryColor: "#2d333b",
			primaryBorderColor: "#6d5dfc",
			primaryTextColor: "#e6edf3",
			lineColor: "#8b949e",
			clusterBkg: "#161b22",
			clusterBorder: "#30363d",
		},
	},
});

export default withMermaid(config);
