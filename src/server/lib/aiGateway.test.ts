import { generateText } from "ai";
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

const completion = () =>
  Response.json({
    choices: [
      {
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      },
    ],
  });

// The egress country is cached per module (one lookup per isolate), so each
// test needs a fresh module to run its own lookup.
beforeEach(() => {
  vi.resetModules();
});

async function requestedModel(trace: () => Promise<Response>) {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementationOnce(trace)
    .mockResolvedValueOnce(completion());
  const { aiGatewayConfigFromEnv, buildChatAgentModel } =
    await import("./aiGateway");
  const config = aiGatewayConfigFromEnv({ OPENROUTER_API_KEY: "key" });
  await generateText({ model: buildChatAgentModel(config), prompt: "hi" });
  const body = z
    .object({ model: z.string() })
    .parse(JSON.parse(z.string().parse(fetchMock.mock.calls[1]?.[1]?.body)));
  return body.model;
}

it("selects OpenRouter when AI_GATEWAY is unset", async () => {
  const { aiGatewayConfigFromEnv } = await import("./aiGateway");
  expect(aiGatewayConfigFromEnv({ OPENROUTER_API_KEY: "key" })).toEqual({
    gateway: "openrouter",
    apiKey: "key",
    modelId: undefined,
  });
});

it("sends OpenAI calls to MiniMax M3 from a country where OpenAI is blocked", async () => {
  expect(
    await requestedModel(async () => new Response("colo=HKG\nloc=HK\n")),
  ).toBe("minimax/minimax-m3");
});

it("stays on OpenAI when the country lookup fails", async () => {
  expect(
    await requestedModel(async () => {
      throw new Error("offline");
    }),
  ).toBe("openai/gpt-5.6-luna");
});

it("reads Vercel AI Gateway's decimal-string cost from its metadata", async () => {
  const { requireGatewayCostUsd } = await import("./aiGateway");
  expect(requireGatewayCostUsd({ gateway: { cost: "0.0045405" } })).toBe(
    0.0045405,
  );
});
