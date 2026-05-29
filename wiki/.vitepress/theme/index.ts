import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import mediumZoom from "medium-zoom";
import { onMounted, watch, nextTick } from "vue";
import "./styles/index.css";

export default {
	...DefaultTheme,
	Layout() {
		return h(DefaultTheme.Layout, null, {});
	},
	setup() {
		onMounted(() => {
			initZoom();
		});

		watch(
			() => window.location.href,
			() => nextTick(() => initZoom()),
		);
	},
};

function initZoom() {
	mediumZoom(".main img", { background: "var(--vp-c-bg)" });
	mediumZoom(".mermaid svg", { background: "var(--vp-c-bg)" });
}
