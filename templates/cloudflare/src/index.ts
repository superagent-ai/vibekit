import { proxyToSandbox } from "@cloudflare/sandbox";
import { createCloudflareProvider } from "@vibe-kit/cloudflare";
import { VibeKit } from "@vibe-kit/sdk";
export { Sandbox } from "@cloudflare/sandbox";

export default {
	async fetch(request, env): Promise<Response> {
		// @ts-ignore
		const proxyResponse = await proxyToSandbox(request, env);
		if (proxyResponse) return proxyResponse;

		// @ts-ignore
		const sandbox = createCloudflareProvider({ env: env, hostname: request.headers.get("host") });
		const vibeKit = new VibeKit()
			.withAgent({
				type: "claude",
				provider: "anthropic",
				apiKey: env.ANTHROPIC_API_KEY,
				model: "claude-sonnet-4-20250514",
			})
			.withSandbox(sandbox);

		// Set up event listeners
		// @ts-ignore
		vibeKit.on("update", (message) => console.log("Update:", message));
		// @ts-ignore
		vibeKit.on("error", (error) => console.error("Error:", error));

		await vibeKit.generateCode({
			prompt: "Run 'bun init -r' to create a new bun + react project, set default port 3001",
			mode: "code",
		});
		const previewUrl = await vibeKit.getHost(3001);

		return new Response(previewUrl);
	},
} satisfies ExportedHandler<Env>;
