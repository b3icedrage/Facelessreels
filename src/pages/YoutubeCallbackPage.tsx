import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

export function YoutubeCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const exchangeCode = useAction(api.youtube_actions.exchangeCode);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    async function run() {
      if (errorParam) {
        setError("You declined the YouTube connection.");
        return;
      }
      if (!code || !state) {
        setError("Missing OAuth parameters. Please try connecting again.");
        return;
      }
      try {
        const redirectUri = `${window.location.origin}/youtube/callback`;
        await exchangeCode({ code, state, redirectUri });
        navigate("/dashboard?connected=1", { replace: true });
      } catch (err: any) {
        setError(
          err?.message?.replace(/^\[.*?\]\s*/, "") ||
            "Could not complete the YouTube connection.",
        );
      }
    }
    run();
  }, [searchParams, exchangeCode, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4">
      {error ? (
        <>
          <div className="text-center">
            <div className="mb-3 text-4xl">⚠️</div>
            <h1 className="font-display text-xl font-semibold">Connection failed</h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={() => navigate("/dashboard", { replace: true })}>
            Back to dashboard
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-mono text-sm text-muted-foreground">
            Connecting YouTube channel…
          </p>
        </div>
      )}
    </div>
  );
}
