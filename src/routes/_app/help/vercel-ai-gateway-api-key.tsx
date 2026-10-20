import { createFileRoute } from "@tanstack/react-router";
import {
  helpLinkClassName,
  SecretHelpPage,
} from "@/client/features/help/SecretHelpPage";

const VERCEL_AI_GATEWAY_KEYS_URL =
  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys&title=AI+Gateway+API+Keys";

export const Route = createFileRoute("/_app/help/vercel-ai-gateway-api-key")({
  component: VercelAiGatewayApiKeyHelpPage,
});

function VercelAiGatewayApiKeyHelpPage() {
  return (
    <SecretHelpPage
      title="Set up your Vercel AI Gateway API key"
      intro={
        <>
          With <code>AI_GATEWAY=vercel</code>, OpenSEO needs the{" "}
          <code>AI_GATEWAY_API_KEY</code> secret before AI features like SAM,
          the in-app SEO agent, can run. It is optional — everything else in
          OpenSEO works without it.
        </>
      }
      secretName="AI_GATEWAY_API_KEY"
      steps={
        <>
          <li>
            Sign in to{" "}
            <a
              className={helpLinkClassName}
              href="https://vercel.com/ai-gateway"
              target="_blank"
              rel="noreferrer"
            >
              Vercel AI Gateway
            </a>{" "}
            and add credits (pay-as-you-go at provider prices).
          </li>
          <li>
            Go to{" "}
            <a
              className={helpLinkClassName}
              href={VERCEL_AI_GATEWAY_KEYS_URL}
              target="_blank"
              rel="noreferrer"
            >
              AI Gateway API Keys
            </a>{" "}
            and click "Create key".
          </li>
          <li>
            Save the key as the <code>AI_GATEWAY_API_KEY</code> secret, and set{" "}
            <code>AI_GATEWAY=vercel</code> next to it, in your environment:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Docker self-hosting: <code>.env</code>
              </li>
              <li>
                Cloudflare: set the key in the Workers UI (see below) and{" "}
                <code>AI_GATEWAY=vercel</code> in <code>.env.selfhost</code>
              </li>
              <li>
                Local development: <code>.env.local</code>
              </li>
            </ul>
          </li>
          <li>Restart OpenSEO.</li>
        </>
      }
      dashboardPasteStep="Paste your Vercel AI Gateway API key and save."
      terminalPromptHint="Paste your Vercel AI Gateway API key when prompted."
    />
  );
}
