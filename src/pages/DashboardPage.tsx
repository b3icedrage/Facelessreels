import { useEffect, useState } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import {
  CalendarClock,
  CheckCircle2,
  Clapperboard,
  CloudUpload,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
  Youtube,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Status = "queued" | "generating" | "rendered" | "uploading" | "posted" | "failed";

const STATUS_META: Record<Status, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" | "accent" }> = {
  queued: { label: "Queued", variant: "default" },
  generating: { label: "Rendering", variant: "accent" },
  rendered: { label: "Ready", variant: "warning" },
  uploading: { label: "Uploading", variant: "secondary" },
  posted: { label: "Posted", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

const ASPECTS = [
  { value: "9:16", label: "9:16 · Vertical (Reels/Shorts)" },
  { value: "16:9", label: "16:9 · Widescreen" },
  { value: "1:1", label: "1:1 · Square" },
];

const DURATIONS = [
  { value: 5, label: "5 seconds" },
  { value: 8, label: "8 seconds" },
];

function formatAgo(ts?: number) {
  if (!ts) return "—";
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatNextDue(ms: number | null | undefined) {
  if (ms == null) return "now";
  const mins = Math.ceil(ms / 60_000);
  if (mins <= 0) return "any moment";
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  return `in ${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

export function DashboardPage() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const justConnected = searchParams.get("connected") === "1";

  const dashboard = useQuery(api.dashboard.getDashboard);
  const getAuthUrl = useAction(api.youtube_actions.getYoutubeAuthUrl);
  const disconnectYoutube = useMutation(api.youtube_actions.disconnectYoutube);

  // Studio form
  const createManualReel = useMutation(api.reels.createManualReel);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [duration, setDuration] = useState(8);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Queue
  const addIdea = useMutation(api.reels.addIdea);
  const removeIdea = useMutation(api.reels.removeIdea);
  const [ideaPrompt, setIdeaPrompt] = useState("");
  const [ideaTitle, setIdeaTitle] = useState("");

  // Library actions
  const retryReel = useMutation(api.reels.retryReel);
  const postNow = useMutation(api.reels.postNow);
  const deleteReel = useMutation(api.reels.deleteReel);

  // Settings
  const ensureSettings = useMutation(api.settings.ensureSettings);
  const updateSettings = useMutation(api.settings.updateSettings);

  useEffect(() => {
    if (isAuthenticated) ensureSettings();
  }, [isAuthenticated, ensureSettings]);

  useEffect(() => {
    if (!justConnected) return;
    const t = setTimeout(() => setSearchParams({}, { replace: true }), 4000);
    return () => clearTimeout(t);
  }, [justConnected, setSearchParams]);

  async function handleCreateReel() {
    if (prompt.trim().length < 10) {
      setCreateError("Describe the video in at least 10 characters.");
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      await createManualReel({ prompt, aspectRatio, durationSeconds: duration });
      setPrompt("");
    } catch (e: any) {
      setCreateError(e?.message?.replace(/^\[.*?\]\s*/, "") || "Could not start generation.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAddIdea() {
    if (ideaPrompt.trim().length < 10) return;
    try {
      await addIdea({ prompt: ideaPrompt, title: ideaTitle || undefined });
      setIdeaPrompt("");
      setIdeaTitle("");
    } catch (e: any) {
      // surfaced via toast-free inline error below queue
      console.error(e);
    }
  }

  async function handleConnect() {
    const redirectUri = `${window.location.origin}/youtube/callback`;
    try {
      const url = await getAuthUrl({ redirectUri });
      window.location.href = url;
    } catch (e: any) {
      alert(e?.message?.replace(/^\[.*?\]\s*/, "") || "Could not start YouTube connection.");
    }
  }

  if (!isAuthenticated) return null;
  // Still waiting on the first response from the server.
  if (dashboard === undefined) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-24 sm:px-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }
  // Signed in client-side, but the server rejected our session — e.g. it was
  // issued before a JWT key change or a backend reset. Don't spin forever;
  // ask the user to sign in again.
  if (dashboard === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4">
        <div className="glass flex max-w-md flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <LogOut className="h-8 w-8 text-muted-foreground" />
          <h1 className="font-display text-xl font-semibold">Session expired</h1>
          <p className="text-sm text-muted-foreground">
            Your login belongs to an older version of the backend. Sign in again and
            you'll be right back in the studio.
          </p>
          <Button
            className="mt-2"
            onClick={() => {
              signOut();
              navigate("/auth?returnTo=/dashboard");
            }}
          >
            Sign in again
          </Button>
        </div>
      </div>
    );
  }

  const { reels, ideas, youtube, settings, stats } = dashboard;

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="rec-dot" />
            <span className="font-display text-base font-bold tracking-wide">
              FACELESS <span className="text-primary">REELS</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="sm">Landing</Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut();
                navigate("/");
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {justConnected && (
        <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-center text-sm text-emerald-300">
          <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
          YouTube channel connected! Your pipeline is ready to post.
        </div>
      )}

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6">
        {/* ---------- Status strip ---------- */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Youtube}
            label="YouTube"
            value={youtube ? youtube.channelTitle : "Not connected"}
            sub={youtube ? "Connected channel" : "Connect to auto-post"}
            tone={youtube ? "success" : "muted"}
          />
          <StatCard
            icon={Sparkles}
            label="Posted reels"
            value={String(stats.posted)}
            sub="on your channel"
            tone="primary"
          />
          <StatCard
            icon={CalendarClock}
            label="Next auto-post"
            value={formatNextDue(stats.nextDueMs)}
            sub={stats.autoPost ? "pipeline live" : "autopilot off"}
            tone="accent"
          />
          <StatCard
            icon={Send}
            label="Idea queue"
            value={`${stats.queuedIdeas} queued`}
            sub={stats.inFlight ? `${stats.inFlight} job(s) in flight` : "idle"}
            tone="secondary"
          />
        </section>

        {/* ---------- YouTube connect banner ---------- */}
        {!youtube && (
          <section className="glass flex flex-col items-center justify-between gap-4 rounded-2xl border-dashed p-6 sm:flex-row">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary/15">
                <Youtube className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <h2 className="font-display text-base font-semibold">Connect your YouTube channel</h2>
                <p className="text-sm text-muted-foreground">
                  One-time authorization. Faceless Reels can then upload on your schedule.
                </p>
              </div>
            </div>
            <Button onClick={handleConnect}>
              <Youtube className="h-4 w-4" />
              Connect YouTube
            </Button>
          </section>
        )}

        {/* ---------- Studio + Queue ---------- */}
        <section className="grid gap-6 lg:grid-cols-5">
          {/* Create one now */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="rec-dot" />
                <CardTitle>Studio — generate one now</CardTitle>
              </div>
              <CardDescription>
                Describe any video. Google Veo renders it; if autopilot is on and YouTube is
                connected, it posts automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="prompt">Video prompt</Label>
                <Textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. Cinematic drone shot over a misty mountain range at golden hour, ultra realistic, 8 seconds"
                  rows={4}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Aspect ratio</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASPECTS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
              <Button onClick={handleCreateReel} disabled={creating} className="w-full sm:w-auto">
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {creating ? "Starting render…" : "Generate reel"}
              </Button>
            </CardContent>
          </Card>

          {/* Queue */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Auto-pilot queue</CardTitle>
              <CardDescription>
                The pipeline works these ideas in order, on your schedule.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Input
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  placeholder="Optional title"
                />
                <div className="flex gap-2">
                  <Input
                    value={ideaPrompt}
                    onChange={(e) => setIdeaPrompt(e.target.value)}
                    placeholder="Describe the video idea…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddIdea();
                    }}
                  />
                  <Button size="icon" onClick={handleAddIdea} disabled={ideaPrompt.trim().length < 10}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {ideas.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Queue is empty. Add an idea to start the autopilot.
                  </p>
                )}
                {ideas.map((idea) => (
                  <div
                    key={idea._id}
                    className="group flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/40 p-3"
                  >
                    <div className="min-w-0">
                      {idea.title && (
                        <p className="truncate text-sm font-medium text-foreground">{idea.title}</p>
                      )}
                      <p className="line-clamp-2 text-xs text-muted-foreground">{idea.prompt}</p>
                      <Badge
                        variant={
                          idea.status === "posted" ? "success" :
                          idea.status === "failed" ? "destructive" :
                          idea.status === "in_progress" ? "accent" : "outline"
                        }
                        className="mt-1.5"
                      >
                        {idea.status.replace("_", " ")}
                      </Badge>
                    </div>
                    {idea.status !== "in_progress" && idea.status !== "posted" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => removeIdea({ ideaId: idea._id })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ---------- Library ---------- */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">Library</h2>
              <p className="text-sm text-muted-foreground">
                Every reel you've made — rendered, posted, or still baking.
              </p>
            </div>
            <Badge variant="outline" className="font-mono">
              {reels.length} reels
            </Badge>
          </div>

          {reels.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <Clapperboard className="h-10 w-10 text-muted-foreground" />
                <p className="font-display font-semibold">No reels yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Generate one above, or add ideas to the queue and let the autopilot fill this up.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {reels.map((reel, i) => (
                <motion.div
                  key={reel._id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4) }}
                >
                  <ReelCard
                    reel={reel}
                    onRetry={() => retryReel({ reelId: reel._id })}
                    onPost={() => postNow({ reelId: reel._id })}
                    onDelete={() => deleteReel({ reelId: reel._id })}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* ---------- Automation settings ---------- */}
        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Autopilot</CardTitle>
              <CardDescription>
                Keep YouTube connected and autopilot on to post on schedule.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-4">
                <div>
                  <p className="font-medium">Automatic posting</p>
                  <p className="text-sm text-muted-foreground">
                    Generate from the queue and upload to YouTube automatically.
                  </p>
                </div>
                <Switch
                  checked={settings?.autoPost ?? true}
                  onCheckedChange={(v) => updateSettings({ autoPost: v })}
                />
              </div>

              <div className="space-y-2">
                <Label>Posting interval</Label>
                <Select
                  value={String(settings?.intervalMinutes ?? 240)}
                  onValueChange={(v) => updateSettings({ intervalMinutes: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="120">Every 2 hours</SelectItem>
                    <SelectItem value="240">Every 4 hours</SelectItem>
                    <SelectItem value="480">Every 8 hours</SelectItem>
                    <SelectItem value="1440">Once a day</SelectItem>
                    <SelectItem value="10080">Once a week</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default aspect ratio</Label>
                <Select
                  value={settings?.aspectRatio ?? "9:16"}
                  onValueChange={(v) => updateSettings({ aspectRatio: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECTS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default duration</Label>
                <Select
                  value={String(settings?.durationSeconds ?? 8)}
                  onValueChange={(v) => updateSettings({ durationSeconds: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Privacy on upload</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { value: "public", icon: Globe, label: "Public" },
                      { value: "unlisted", icon: Eye, label: "Unlisted" },
                      { value: "private", icon: EyeOff, label: "Private" },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => updateSettings({ privacyStatus: p.value })}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-all",
                        (settings?.privacyStatus ?? "private") === p.value
                          ? "border-primary/60 bg-primary/10 text-foreground"
                          : "border-border/70 text-muted-foreground hover:border-border hover:text-foreground",
                      )}
                    >
                      <p.icon className="h-4 w-4" />
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Tip: start with <span className="text-muted-foreground">Unlisted</span> to preview
                  before going fully public.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Title & description templates</CardTitle>
              <CardDescription>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{"{title}"}</code> and{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{"{prompt}"}</code>{" "}
                are replaced per-reel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="titleTpl">Title template</Label>
                <Input
                  id="titleTpl"
                  value={settings?.titleTemplate ?? "{title}"}
                  onChange={(e) => updateSettings({ titleTemplate: e.target.value })}
                  placeholder="{title}"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="descTpl">Description template</Label>
                <Textarea
                  id="descTpl"
                  value={settings?.descriptionTemplate ?? ""}
                  onChange={(e) => updateSettings({ descriptionTemplate: e.target.value })}
                  rows={6}
                  placeholder="{prompt}"
                />
              </div>

              {youtube && (
                <div className="mt-2 flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-4">
                  <div className="flex items-center gap-3">
                    {youtube.channelThumbnail ? (
                      <img
                        src={youtube.channelThumbnail}
                        alt={youtube.channelTitle}
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/15">
                        <Youtube className="h-5 w-5 text-secondary" />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium">{youtube.channelTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        Connected {formatAgo(youtube.connectedAt)}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => disconnectYoutube()}>
                    Disconnect
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: "primary" | "secondary" | "accent" | "success" | "muted";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/15 text-primary",
    secondary: "bg-secondary/15 text-secondary",
    accent: "bg-accent/15 text-accent",
    success: "bg-emerald-500/15 text-emerald-400",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="glass">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="truncate font-display text-lg font-semibold">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReelCard({
  reel,
  onRetry,
  onPost,
  onDelete,
}: {
  reel: any;
  onRetry: () => void;
  onPost: () => void;
  onDelete: () => void;
}) {
  const meta = STATUS_META[reel.status as Status];
  const [preview, setPreview] = useState<string | null>(null);
  const canPreview = Boolean(reel.videoUri);
  return (
    <Card className="group overflow-hidden transition-all hover:border-primary/30">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {reel.thumbnailUri ? (
          <img
            src={reel.thumbnailUri}
            alt={reel.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3">
            {reel.status === "generating" || reel.status === "uploading" ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="font-mono text-xs text-muted-foreground">rendering…</span>
              </>
            ) : reel.status === "posted" ? (
              <Youtube className="h-10 w-10 text-emerald-400" />
            ) : (
              <Clapperboard className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
        )}
        {canPreview && (
          <button
            type="button"
            onClick={() => setPreview(reel.videoUri)}
            aria-label="Watch video preview"
            className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/15 transition-colors hover:bg-black/35"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl ring-4 ring-white/10 transition-transform duration-200 hover:scale-110">
              <Play className="h-6 w-6 fill-current" />
            </span>
          </button>
        )}
        <Badge variant={meta.variant} className="absolute left-3 top-3 shadow-lg">
          {meta.label}
        </Badge>
        <span className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white/80 backdrop-blur">
          {reel.aspectRatio} · {reel.durationSeconds}s
        </span>
      </div>
      <CardContent className="p-4">
        <p className="line-clamp-1 font-display text-sm font-semibold">{reel.title}</p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{reel.prompt}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {reel.status === "posted" ? `Posted ${formatAgo(reel.postedAt)}` : formatAgo(reel.createdAt)}
          </span>
          <div className="flex items-center gap-1">
            {reel.status === "rendered" && (
              <Button variant="secondary" size="sm" onClick={onPost} title="Upload to YouTube now">
                <CloudUpload className="h-3.5 w-3.5" />
                Post now
              </Button>
            )}
            {(reel.status === "failed" || reel.status === "rendered") && (
              <Button variant="ghost" size="icon" onClick={onRetry} title="Retry">
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
            {reel.youtubeUrl && (
              <Button variant="ghost" size="icon" asChild title="Open on YouTube">
                <a href={reel.youtubeUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 text-emerald-400" />
                </a>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onDelete} title="Delete">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {reel.error && (
          <p className="mt-2 line-clamp-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
            {reel.error}
          </p>
        )}
      </CardContent>
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Video preview"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              key={preview}
              src={preview}
              controls
              autoPlay
              playsInline
              className="max-h-[75vh] w-full"
            />
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white/90 backdrop-blur transition-colors hover:bg-black/85"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        </div>
      )}
    </Card>
  );
}
