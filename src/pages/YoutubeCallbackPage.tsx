import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAction } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { Loader2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

export function YoutubeCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const exchangeCode = useAction(api.youtube_actions.exchangeCode);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // Google redirected us here via a full page load, so the auth session is
    // still being restored from storage. Wait until that resolves before
    // calling any authenticated function.
    if (isLoading) return;
    if (ran.current) return;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      ran.current = true;
      setError("You declined the YouTube connection.");
      return;
    }
    if (!code || !state) {
      ran.current = true;
      setError("Missing OAuth parameters. Please try connecting again.");
      return;
    }
    if (!isAuthenticated) {
      // Session is missing or expired: sign in again, then come back here
      // (with the OAuth code intact) to finish the connection.
      const returnTo = encodeURIComponent(
        `${window.location.pathname}${window.location.search}`,
      );
      navigate(`/auth?returnTo=${returnTo}`, { replace: true });
      return;
    }

    ran.current = true;
    async function run() {
      try {
        const redirectUri = `${window.location.origin}/youtube/callback`;
        await exchangeCode({ code: code!, state: state!, redirectUri });
        navigate("/dashboard?connected=1", { replace: true });
      } catch (err: any) {
        setError(
          err?.message?.replace(/^\[.*?\]\s*/, "") ||
            "Could not complete the YouTube connection.",
        );
      }
    }
    run();
  }, [isLoading, isAuthenticated, searchParams, exchangeCode, navigate]);

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
            {isLoading
              ? "Restoring your session…"
              : isAuthenticated
                ? "Connecting YouTube channel…"
                : "Redirecting to sign in…"}
          </p>
        </div>
      )}
    </div>
  );
}
