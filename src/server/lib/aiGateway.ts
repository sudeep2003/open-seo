import {
  createOpenRouter,
  type LanguageModelV3,
  type OpenRouterProvider,
} from "@openrouter/ai-sdk-provider";
import {
  createGateway,
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type JSONValue,
} from "ai";
import { z } from "zod";
import {
  AI_GATEWAY_ENV,
  parseAiGateway,
  type AiGatewayName,
} from "@/shared/ai-gateway";
import {
  getEnvValueSync,
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

// The provider packages re-export the model interface; ai does not.
export type { LanguageModelV3 };

type ReasoningEffort = "max" | "low";

type AiGatewayConfig = {
  gateway: AiGatewayName;
  apiKey: string;
  // The gateway's model override (OPENROUTER_MODEL / AI_GATEWAY_MODEL).
  modelId: string | undefined;
};

// Model slug used for the AI features on every gateway. Override with the
// gateway's model env var to swap models without a code change.
const DEFAULT_CHAT_AGENT_MODEL = "openai/gpt-5.6-luna";

// Previous default; kept reachable via the model override for rollback, and
// the fallback where OpenAI is blocked. Its routing needs the provider tuning
// below.
const MINIMAX_M3 = "minimax/minimax-m3";

function selectGateway(value: string | undefined): AiGatewayName {
  const parsed = parseAiGateway(value);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.gateway;
}

/** The selected gateway's name, used as the billing and telemetry label. */
export function aiGatewayName(env: object): AiGatewayName {
  return selectGateway(getEnvValueSync(env, "AI_GATEWAY"));
}

/**
 * Sync on purpose: Think's `getModel()` hook is sync and runs on every turn,
 * so the SAM agent reads the gateway config from its DO env.
 */
export function aiGatewayConfigFromEnv(env: object): AiGatewayConfig {
  const gateway = aiGatewayName(env);
  const names = AI_GATEWAY_ENV[gateway];
  const apiKey = getEnvValueSync(env, names.apiKey);
  if (!apiKey) {
    throw new Error(`${names.apiKey} is required for the SAM agent`);
  }
  return { gateway, apiKey, modelId: getEnvValueSync(env, names.model) };
}

export async function loadAiGatewayConfig(): Promise<AiGatewayConfig> {
  const gateway = selectGateway(await getOptionalEnvValue("AI_GATEWAY"));
  const names = AI_GATEWAY_ENV[gateway];
  return {
    gateway,
    apiKey: await getRequiredEnvValue(names.apiKey),
    modelId: await getOptionalEnvValue(names.model),
  };
}

/**
 * Returns the AI SDK LanguageModel for the AI features on the selected
 * gateway. Every response carries its real USD cost in provider metadata
 * (see gatewayCostUsd), which we meter against the shared usage-credit pool.
 *
 * Default model: GPT-5.6 Luna at reasoning effort "max". Reasoning tokens
 * stream on the separate reasoning channel and are billed as output tokens,
 * which the reported cost includes.
 */
export function buildChatAgentModel(
  config: AiGatewayConfig,
  reasoningEffort: ReasoningEffort = "max",
): LanguageModelV3 {
  const model = config.modelId ?? DEFAULT_CHAT_AGENT_MODEL;
  return config.gateway === "vercel"
    ? vercelModel(config.apiKey, model, reasoningEffort)
    : openRouterChatModel(config.apiKey, model, reasoningEffort);
}

// Each gateway reports the real USD cost of a response in its provider
// metadata: OpenRouter (with usage accounting on) as a number under
// openrouter.usage.cost, Vercel AI Gateway as a decimal string under
// gateway.cost.
const gatewayCostSchema = z.union([
  z
    .object({ openrouter: z.object({ usage: z.object({ cost: z.number() }) }) })
    .transform((metadata) => metadata.openrouter.usage.cost),
  z
    .object({
      gateway: z.object({
        cost: z.string().transform(Number).pipe(z.number()),
      }),
    })
    .transform((metadata) => metadata.gateway.cost),
]);

export function gatewayCostUsd(providerMetadata: unknown): number {
  const parsed = gatewayCostSchema.safeParse(providerMetadata);
  return parsed.success ? parsed.data : 0;
}

export function requireGatewayCostUsd(providerMetadata: unknown): number {
  return gatewayCostSchema.parse(providerMetadata);
}

// OpenRouter rejects OpenAI models for requests from these countries ("This
// model is not available in your region"). Workflows and Durable Objects run
// near the user, outside prod's US placement.
const OPENAI_BLOCKED_COUNTRIES = [
  "CN",
  "HK",
  "MO",
  "RU",
  "BY",
  "IR",
  "KP",
  "SY",
  "CU",
];

// The country this isolate's requests leave from. An isolate stays in one
// location, so one lookup serves its lifetime. Caches the value, not the
// promise: Workers can't share a pending fetch across requests. Fails open: a
// slow or failed lookup leaves the country unknown, and calls stay on OpenAI.
let egressCountry: string | undefined;
async function openAiBlockedHere(): Promise<boolean> {
  egressCountry ??= await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
    signal: AbortSignal.timeout(2000),
  })
    .then((response) => response.text())
    .then((trace) => /^loc=(\w+)$/m.exec(trace)?.[1] ?? "")
    .catch(() => "");
  return OPENAI_BLOCKED_COUNTRIES.includes(egressCountry);
}

// OpenRouter: `usage: { include: true }` turns on usage accounting so each
// response carries its cost. "max" is valid at the OpenRouter API for GPT-5.x
// but missing from the SDK's effort union, so the reasoning config rides in
// `extraBody`.
function openRouterChatModel(
  apiKey: string,
  model: string,
  reasoningEffort: ReasoningEffort,
): LanguageModelV3 {
  const openrouter = createOpenRouter({ apiKey });
  const primary = openRouterModel(openrouter, model, reasoningEffort);
  if (!model.startsWith("openai/")) return primary;
  // Where OpenRouter would reject OpenAI, pick MiniMax M3 before the request.
  // The country lookup is async and getModel() is sync, so it runs per call.
  const fallback = openRouterModel(openrouter, MINIMAX_M3, reasoningEffort);
  const pick = async () => ((await openAiBlockedHere()) ? fallback : primary);
  return wrapLanguageModel({
    model: primary,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ params }) => (await pick()).doGenerate(params),
      wrapStream: async ({ params }) => (await pick()).doStream(params),
    },
  });
}

function openRouterModel(
  openrouter: OpenRouterProvider,
  model: string,
  reasoningEffort: ReasoningEffort,
): LanguageModelV3 {
  // MiniMax M3 (env override or OpenAI fallback): `provider.order` prefers
  // Together, then Atlas Cloud (fp8); `zdr: true` restricts routing to Zero-Data-
  // Retention endpoints, which excludes MiniMax first-party — the account's
  // "Non-frontier requires ZDR" data policy enforces the same, this flag is
  // belt-and-braces. Fallbacks stay on within the ZDR set because pinning
  // providers caused a prod outage (Jul 2026: Together upstream-rate-limited
  // m3 and every chat turn 429'd). The explicit reasoning channel keeps m3's
  // `<think>` trace out of the visible answer text.
  if (model === MINIMAX_M3) {
    return openrouter(model, {
      usage: { include: true },
      reasoning: { effort: reasoningEffort === "low" ? "low" : "medium" },
      provider: {
        order: ["together", "atlas-cloud/fp8"],
        zdr: true,
        allow_fallbacks: true,
      },
    });
  }

  return openrouter(model, {
    usage: { include: true },
    extraBody: { reasoning: { effort: reasoningEffort } },
  });
}

// Vercel AI Gateway reports cost on every response, so it needs no usage
// flag. Routing options ride in providerOptions, merged into every call.
function vercelModel(
  apiKey: string,
  model: string,
  reasoningEffort: ReasoningEffort,
): LanguageModelV3 {
  return wrapLanguageModel({
    model: createGateway({ apiKey })(model),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: vercelProviderOptions(model, reasoningEffort),
      },
    }),
  });
}

function vercelProviderOptions(
  model: string,
  reasoningEffort: ReasoningEffort,
): Record<string, Record<string, JSONValue>> {
  // MiniMax M3 (env override or OpenAI fallback): `order` tries Fireworks,
  // then Nebius, both Zero-Data-Retention hosts on Vercel, ahead of MiniMax
  // first-party. Other hosts stay reachable after them, for the same reason
  // OpenRouter keeps fallbacks on. Strict ZDR is a Vercel team setting, not
  // forced here: per-request ZDR is limited to paid Vercel plans.
  const minimaxOrder = ["fireworks", "nebius"];
  if (model === MINIMAX_M3) return { gateway: { order: minimaxOrder } };
  if (!model.startsWith("openai/")) return {};
  // Vercel calls OpenAI from its own infrastructure, so the Worker's egress
  // country is not what OpenAI sees and the lookup above does not apply.
  // Instead M3 is a gateway-side model fallback: if every OpenAI provider
  // refuses the request, for a region block or an outage, the same request
  // falls through to M3. `order` only promotes hosts that serve a model, so
  // it leaves the OpenAI routing alone.
  return {
    gateway: { order: minimaxOrder, models: [MINIMAX_M3] },
    openai: { reasoningEffort },
  };
}
