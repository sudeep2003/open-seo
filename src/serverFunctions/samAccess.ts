import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  AI_GATEWAY_ENV,
  parseAiGateway,
  type AiGatewayName,
} from "@/shared/ai-gateway";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type SamAccessStatus = {
  enabled: boolean;
  errorMessage: string | null;
  // The gateway whose key the setup gate asks for.
  gateway: AiGatewayName;
};

// Gates the in-app AI agent (SAM) on the selected AI gateway's key being
// configured, the same way backlinks/AI-search gate on their DataForSEO
// subscriptions. Hosted deployments always have the key provisioned, so only
// self-hosted is checked.
export const getSamAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<SamAccessStatus> => {
    const parsed = parseAiGateway(await getOptionalEnvValue("AI_GATEWAY"));
    // An invalid AI_GATEWAY disables SAM; the gate shows the default
    // gateway's setup steps with the error that explains the value.
    const gateway = parsed.ok ? parsed.gateway : "openrouter";
    if (await isHostedServerAuthMode()) {
      return { enabled: true, errorMessage: null, gateway };
    }
    if (!parsed.ok) {
      return { enabled: false, errorMessage: parsed.message, gateway };
    }

    const apiKey = AI_GATEWAY_ENV[gateway].apiKey;
    const enabled = Boolean(await getOptionalEnvValue(apiKey));
    return {
      enabled,
      errorMessage: enabled
        ? null
        : `${apiKey} is not set for this deployment yet. Add it to your environment, restart OpenSEO, then confirm here.`,
      gateway,
    };
  });
