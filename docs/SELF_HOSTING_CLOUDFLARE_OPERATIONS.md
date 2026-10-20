# Cloudflare Self-Hosting: Operations

Day-to-day tasks after [initial setup](./SELF_HOSTING_CLOUDFLARE.md): connect the MCP server, render JavaScript in site audits, and manage telemetry. Updating and teammate access are covered in the [deploy guide](./SELF_HOSTING_CLOUDFLARE.md) (or the [legacy page](./SELF_HOSTING_CLOUDFLARE_LEGACY.md) for pre-alchemy deployments).

## Connect the MCP server through Cloudflare Access

Use the same Cloudflare Access application that protects your OpenSEO Worker.
Managed OAuth is required for MCP clients and is not enabled by default.

1. Open Cloudflare Zero Trust.
2. Go to `Access controls` -> `Applications`.
3. Find your OpenSEO application, then select `Edit`.
4. Go to `Additional settings` -> `OAuth`.
5. Turn on `Managed OAuth`.
6. In `Managed OAuth settings`, allow the redirect URIs your MCP clients use:
   - Allow `localhost` / loopback clients for CLI and desktop agents (Codex
     CLI, Claude Code) that register `http://localhost:PORT/callback`.
   - Add HTTPS redirect URIs for web connectors (a path may end in `/*`).
   - Without this, clients can't finish [Dynamic Client Registration](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
     and log in but expose no tools.
7. Save.

MCP clients should connect to:

```text
https://YOUR_WORKER_HOSTNAME/mcp
```

## AI gateway

SAM (the in-app SEO agent), website research, and AI Visibility prompt suggestions call an LLM through an AI gateway. Set `AI_GATEWAY` in `.env.selfhost` to choose one, then add that gateway's key:

| `AI_GATEWAY`                      | API key              | Optional model override |
| --------------------------------- | -------------------- | ----------------------- |
| `openrouter` (default when unset) | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL`      |
| `vercel`                          | `AI_GATEWAY_API_KEY` | `AI_GATEWAY_MODEL`      |

Create an OpenRouter key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys), or a Vercel AI Gateway key on the [AI Gateway API Keys page](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys&title=AI+Gateway+API+Keys) of your Vercel dashboard. Both gateways default to `openai/gpt-5.6-luna`, and you pay the gateway directly. Without the selected gateway's key, the AI features stay off and the rest of OpenSEO still works.

Then run `pnpm deploy:selfhost --yes` again. Keep these values in `.env.selfhost` rather than the Cloudflare dashboard, because each deploy resets the Worker's variables.

## AI visibility tracking

AI Visibility uses your `DATAFORSEO_API_KEY`; tracked questions are sent to DataForSEO and billed directly by the provider. Set your [AI gateway](#ai-gateway) key for setup research and generated prompt suggestions. Deployment configures background collection and a five-minute cron that dispatches due daily, weekly, or monthly checks. The app shows the collection cost before a check or schedule starts. See the [AI Visibility guide](https://openseo.so/docs/ai-visibility).

## Render JavaScript in site audits

Site Audit can load pages in a browser before analyzing them. Turn on **Render JavaScript** when starting an audit if the site builds its content or links client-side (React and other single-page apps). Rendered audits take longer.

Rendering uses [Cloudflare Browser Run](https://developers.cloudflare.com/browser-run/) on your own Cloudflare account. The deploy binds a browser to the audit Worker, so the toggle works with no extra setup. **Rendering needs a paid Workers plan.** The free plan allows one browser action every ten seconds, which is too slow for a crawl. The paid plan includes 10 browser hours a month, then bills $0.09 per browser hour.

Some sites block Cloudflare's browser. To render those pages through [Context.dev](https://www.context.dev) instead, create a Context account, set `CONTEXT_API_KEY` in `.env.selfhost`, and redeploy. OpenSEO calls Context only for pages that Browser Run could not render, and each of those pages uses one Context credit on your Context account.

Docker deployments have no browser. On Docker, set `CONTEXT_API_KEY` in `.env.local` to render every page through Context. Until the key is set, the **Render JavaScript** toggle stays disabled with a setup note.

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

Heartbeats are triggered by requests to the app or MCP server. Requests to `/api/health` do not trigger telemetry, matching Docker's behavior.

To disable it, set `OPENSEO_TELEMETRY_DISABLED=1` in `.env.selfhost` and redeploy. Docker and [legacy deployments](./SELF_HOSTING_CLOUDFLARE_LEGACY.md): set it (or `DO_NOT_TRACK=1`) as an environment variable / Worker variable instead.
