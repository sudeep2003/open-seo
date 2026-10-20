import { Link } from "@tanstack/react-router";
import { ShieldAlert, Wrench } from "lucide-react";
import { GateCard } from "@/client/components/GateCard";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { AI_GATEWAY_ENV, type AiGatewayName } from "@/shared/ai-gateway";

// Where each gateway's key is created, and the in-app guide for it.
const GATEWAY_SETUP = {
  openrouter: {
    keyName: "an OpenRouter API key",
    helpRoute: "/help/openrouter-api-key",
    keysUrl: "https://openrouter.ai/settings/keys",
    keysLabel: "Open OpenRouter Keys",
  },
  vercel: {
    keyName: "a Vercel AI Gateway API key",
    helpRoute: "/help/vercel-ai-gateway-api-key",
    keysUrl:
      "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys&title=AI+Gateway+API+Keys",
    keysLabel: "Open Vercel AI Gateway Keys",
  },
} as const;

export function SamSetupGate({
  gateway,
  errorMessage,
  isRefetching,
  onRetry,
}: {
  gateway: AiGatewayName;
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
}) {
  const { label, apiKey } = AI_GATEWAY_ENV[gateway];
  const setup = GATEWAY_SETUP[gateway];
  return (
    <GateCard
      icon={Wrench}
      tone="warning"
      title="Enable AI Features"
      description={
        <>
          <p>
            SAM, OpenSEO&apos;s in-app AI agent, needs {setup.keyName}. Create a
            key on {label}, set it as the <code>{apiKey}</code> environment
            variable, restart OpenSEO, then confirm here.
          </p>
          <p className="text-xs">
            Step-by-step instructions for every deployment are in the{" "}
            <Link
              className="underline underline-offset-2 hover:text-foreground"
              to={setup.helpRoute}
            >
              {label} API key setup guide
            </Link>
            .
          </p>
        </>
      }
      actions={
        <>
          <Button size="lg" pending={isRefetching} onClick={onRetry}>
            Confirm API Key
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<a href={setup.keysUrl} target="_blank" rel="noreferrer" />}
          >
            {setup.keysLabel}
          </Button>
        </>
      }
    >
      {errorMessage ? (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertDescription className="text-foreground">
            {errorMessage}
          </AlertDescription>
        </Alert>
      ) : null}
    </GateCard>
  );
}
