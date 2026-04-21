import type { PluginDescriptor } from "emdash";

export function slackPlugin(): PluginDescriptor {
	return {
		id: "emdash-plugin-slack",
		version: "0.1.1",
		format: "standard",
		entrypoint: "emdash-plugin-slack/sandbox",
		capabilities: ["network:fetch:any", "read:content"],
		adminPages: [{ path: "/settings", label: "Slack Notifications", icon: "settings" }],
	};
}

export default slackPlugin;
