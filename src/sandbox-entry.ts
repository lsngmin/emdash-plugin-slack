import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

const DEFAULT_MESSAGE_TEMPLATE =
	"📢 *{{title}}* has been published in *{{collection}}*.\n{{url}}";

function renderTemplate(template: string, variables: Record<string, string>) {
	return template
		.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => variables[key] ?? "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

async function buildSettingsPage(ctx: PluginContext) {
	const webhookUrl = (await ctx.kv.get<string>("settings:webhookUrl")) ?? "";
	const messageTemplate =
		(await ctx.kv.get<string>("settings:messageTemplate")) ?? DEFAULT_MESSAGE_TEMPLATE;

	return {
		blocks: [
			{ type: "header", text: "Slack Notifications" },
			{
				type: "context",
				text: "Send a custom Slack message when content is published.",
			},
			{ type: "divider" },
			{
				type: "context",
				text: "Available variables: {{title}}, {{collection}}, {{slug}}, {{id}}, {{url}}",
			},
			{
				type: "form",
				block_id: "slack-settings",
				fields: [
					{
						type: "text_input",
						action_id: "webhookUrl",
						label: "Webhook URL",
						placeholder: "https://hooks.slack.com/services/...",
						initial_value: webhookUrl,
					},
					{
						type: "text_input",
						action_id: "messageTemplate",
						label: "Message Template",
						placeholder:
							"📢 *{{title}}* has been published in *{{collection}}*.\n{{url}}",
						initial_value: messageTemplate,
						multiline: true,
					},
				],
				submit: { label: "Save Settings", action_id: "save_settings" },
			},
		],
	};
}

async function saveSettings(ctx: PluginContext, values: Record<string, unknown>) {
	await ctx.kv.set("settings:webhookUrl", typeof values.webhookUrl === "string" ? values.webhookUrl : "");
	await ctx.kv.set(
		"settings:messageTemplate",
		typeof values.messageTemplate === "string" && values.messageTemplate.trim()
			? values.messageTemplate
			: DEFAULT_MESSAGE_TEMPLATE,
	);

	return {
		...(await buildSettingsPage(ctx)),
		toast: { type: "success", message: "Settings saved." },
	};
}

export default definePlugin({
	hooks: {
		"content:afterPublish": {
			handler: async (event: any, ctx: PluginContext) => {
				const webhookUrl = await ctx.kv.get<string>("settings:webhookUrl");
				if (!webhookUrl) {
					ctx.log.warn("[slack-plugin] webhookUrl not configured — skipping notification");
					return;
				}

				const content = event.content as { id: string; slug?: string; title?: string };
				const collection = event.collection as string;
				const title = content.title ?? content.slug ?? content.id;
				const slugOrId = content.slug ?? content.id;
				const link = ctx.site.url ? ctx.url(`/${collection}/${slugOrId}`) : null;
				const template =
					(await ctx.kv.get<string>("settings:messageTemplate")) ?? DEFAULT_MESSAGE_TEMPLATE;
				const text = renderTemplate(template, {
					title,
					collection,
					slug: content.slug ?? "",
					id: content.id,
					url: link ?? "",
				});

				if (!ctx.http) {
					ctx.log.warn(
						"[slack-plugin] ctx.http not available — missing network:fetch:any capability?",
					);
					return;
				}

				try {
					const res = await ctx.http.fetch(webhookUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ text }),
					});
					if (!res.ok) {
						ctx.log.error("[slack-plugin] Slack webhook returned non-OK status", {
							status: res.status,
						});
					} else {
						ctx.log.info("[slack-plugin] Slack notification sent", {
							collection,
							id: content.id,
						});
					}
				} catch (err) {
					ctx.log.error("[slack-plugin] Failed to send Slack notification", {
						error: String(err),
					});
				}
			},
		},
	},

	routes: {
		// Block Kit admin handler — handles page_load and interactions
		admin: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const interaction = routeCtx.input as {
					type: string;
					page?: string;
					action_id?: string;
					values?: Record<string, unknown>;
				};

				// ── Page load: render settings form ──────────────────────────────
				if (interaction.type === "page_load" && interaction.page === "/settings") {
					return buildSettingsPage(ctx);
				}

				// ── Save action ───────────────────────────────────────────────────
				if (interaction.type === "form_submit" && interaction.action_id === "save_settings") {
					return saveSettings(ctx, interaction.values ?? {});
				}

				return { blocks: [] };
			},
		},
	},
});
