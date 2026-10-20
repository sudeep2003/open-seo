import { z } from "zod";

// The LLM gateway that serves OpenSEO's AI features (SAM, website research,
// AI Visibility prompt suggestions), chosen with the AI_GATEWAY env var.
// Shared by the server, /api/health and the Docker preflight so every surface
// asks for the same key.
const aiGatewaySchema = z.enum(["openrouter", "vercel"]);

export type AiGatewayName = z.infer<typeof aiGatewaySchema>;

// Each gateway's API key and optional model-override env vars.
export const AI_GATEWAY_ENV = {
  openrouter: {
    label: "OpenRouter",
    apiKey: "OPENROUTER_API_KEY",
    model: "OPENROUTER_MODEL",
  },
  vercel: {
    label: "Vercel AI Gateway",
    apiKey: "AI_GATEWAY_API_KEY",
    model: "AI_GATEWAY_MODEL",
  },
} as const;

/** Unset means OpenRouter; anything else must name a supported gateway. */
export function parseAiGateway(
  value: string | undefined,
): { ok: true; gateway: AiGatewayName } | { ok: false; message: string } {
  const parsed = aiGatewaySchema.safeParse(value ?? "openrouter");
  return parsed.success
    ? { ok: true, gateway: parsed.data }
    : {
        ok: false,
        message: `"${value}" is not a valid AI_GATEWAY. Valid values: ${aiGatewaySchema.options.join(", ")}.`,
      };
}
