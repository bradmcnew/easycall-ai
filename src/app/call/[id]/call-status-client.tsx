"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPusherClient } from "@/lib/pusher-client";
import { callChannel } from "@/lib/call-channel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Phone,
  PhoneOff,
  PhoneCall,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  WifiOff,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

// ---------- Types ----------

type CallStatus =
  | "pending"
  | "dialing"
  | "navigating"
  | "on_hold"
  | "agent_detected"
  | "transferring"
  | "connected"
  | "completed"
  | "failed";

interface CallStatusClientProps {
  callId: string;
  initialStatus: CallStatus;
  ispName: string;
  ispLogoUrl: string;
  categoryLabel: string;
  userNote: string | null;
  startedAt: string | null;
  endedAt: string | null;
  endedReason: string | null;
  ispSlug: string;
  categorySlug: string;
}

// ---------- Transcript types ----------

interface TranscriptLine {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

// ---------- Status display config ----------

const STATUS_DISPLAY: Record<
  CallStatus,
  { label: string; description: string | null }
> = {
  pending: {
    label: "Starting...",
    description: "Getting ready to place your call",
  },
  dialing: {
    label: "Dialing",
    description: null, // dynamically uses ISP name
  },
  navigating: {
    label: "Navigating Menu",
    description: "AI is working through the phone menu to reach the right department",
  },
  on_hold: {
    label: "On Hold",
    description: "Waiting for an agent. We'll let you know when someone picks up.",
  },
  agent_detected: {
    label: "Agent Found!",
    description: "A live agent has picked up the phone",
  },
  transferring: {
    label: "Connecting You...",
    description: "Calling you back now. Pick up your phone!",
  },
  connected: {
    label: "Connected",
    description: null, // dynamically uses ISP name
  },
  completed: {
    label: "Complete",
    description: null,
  },
  failed: {
    label: "Call Failed",
    description: null,
  },
};

// ---------- Error reason display ----------

const ENDED_REASON_DISPLAY: Record<
  string,
  { label: string; description: string }
> = {
  "customer-busy": {
    label: "Line Busy",
    description: "The ISP's line is busy right now.",
  },
  "customer-did-not-answer": {
    label: "No Answer",
    description: "The call wasn't answered.",
  },
  "exceeded-max-duration": {
    label: "Call Timed Out",
    description: "The call reached the maximum duration of 45 minutes.",
  },
  "silence-timed-out": {
    label: "Disconnected",
    description: "The call was disconnected due to inactivity.",
  },
  "manually-canceled": {
    label: "Call Cancelled",
    description: "You cancelled the call.",
  },
  "twilio-failed-to-connect-call": {
    label: "Connection Failed",
    description: "We couldn't connect the call.",
  },
  "assistant-error": {
    label: "Something Went Wrong",
    description: "An error occurred during the call.",
  },
  "user-no-answer": {
    label: "Couldn't Reach You",
    description:
      "We tried to call you back but couldn't reach you. The agent was notified.",
  },
  "bridge-failed": {
    label: "Connection Failed",
    description:
      "We found an agent but couldn't connect the call. You can try again.",
  },
  "agent-hung-up": {
    label: "Agent Disconnected",
    description:
      "The agent hung up before we could connect you. You can try again.",
  },
  "transfer-failed": {
    label: "Transfer Failed",
    description:
      "Something went wrong during the transfer. You can try again.",
  },
};

function getEndedReasonDisplay(reason: string | null): {
  label: string;
  description: string;
} {
  if (!reason) return { label: "Call Ended", description: "The call has ended." };
  return (
    ENDED_REASON_DISPLAY[reason] ?? {
      label: "Call Ended",
      description: "The call has ended.",
    }
  );
}

// ---------- Call step progression ----------

type CallStep = {
  key: CallStatus;
  label: string;
};

const CALL_STEPS: CallStep[] = [
  { key: "dialing", label: "Dialing" },
  { key: "navigating", label: "Navigating" },
  { key: "on_hold", label: "On Hold" },
  { key: "agent_detected", label: "Agent Found" },
  { key: "transferring", label: "Connecting" },
  { key: "connected", label: "Connected" },
  { key: "completed", label: "Complete" },
];

function getStepState(
  stepKey: CallStatus,
  currentStatus: CallStatus
): "completed" | "current" | "upcoming" {
  const stepOrder: CallStatus[] = [
    "pending",
    "dialing",
    "navigating",
    "on_hold",
    "agent_detected",
    "transferring",
    "connected",
    "completed",
  ];

  const currentIdx = stepOrder.indexOf(currentStatus);
  const stepIdx = stepOrder.indexOf(stepKey);

  if (currentStatus === "completed" || currentStatus === "failed") {
    if (stepKey === "completed") return "current";
    return "completed";
  }

  if (stepIdx < currentIdx) return "completed";
  if (stepIdx === currentIdx) return "current";
  return "upcoming";
}

// ---------- Timer formatting ----------

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// ---------- Active statuses ----------

const ACTIVE_STATUSES: CallStatus[] = [
  "pending",
  "dialing",
  "navigating",
  "on_hold",
  "agent_detected",
  "transferring",
  "connected",
];

function isActiveStatus(status: CallStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

// ---------- Main component ----------

export function CallStatusClient({
  callId,
  initialStatus,
  ispName,
  ispLogoUrl,
  categoryLabel,
  userNote,
  startedAt: initialStartedAt,
  endedAt: initialEndedAt,
  endedReason: initialEndedReason,
  ispSlug,
  categorySlug,
}: CallStatusClientProps) {
  const router = useRouter();

  const [status, setStatus] = useState<CallStatus>(initialStatus);
  const [endedReason, setEndedReason] = useState<string | null>(
    initialEndedReason
  );
  const [startedAt] = useState<string | null>(initialStartedAt);
  const [endedAt, setEndedAt] = useState<string | null>(initialEndedAt);
  const [isConnected, setIsConnected] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [holdSeconds, setHoldSeconds] = useState(0);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [navDetail, setNavDetail] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [connectedSeconds, setConnectedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // ---------- Hold timer ----------

  useEffect(() => {
    if ((status === "on_hold" || status === "navigating") && startedAt) {
      // Calculate initial elapsed time from when call started
      const startTime = new Date(startedAt).getTime();
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - startTime) / 1000));
      setHoldSeconds(elapsed);

      timerRef.current = setInterval(() => {
        setHoldSeconds((prev) => prev + 1);
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }

    // Clear timer when not on hold or navigating
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [status, startedAt]);

  // ---------- Connected call timer ----------

  useEffect(() => {
    if (status === "connected" && connectedAt) {
      const startTime = new Date(connectedAt).getTime();
      const now = Date.now();
      const elapsed = Math.max(0, Math.floor((now - startTime) / 1000));
      setConnectedSeconds(elapsed);

      connectedTimerRef.current = setInterval(() => {
        setConnectedSeconds((prev) => prev + 1);
      }, 1000);

      return () => {
        if (connectedTimerRef.current)
          clearInterval(connectedTimerRef.current);
      };
    }

    if (connectedTimerRef.current) {
      clearInterval(connectedTimerRef.current);
      connectedTimerRef.current = null;
    }
  }, [status, connectedAt]);

  // ---------- Pusher subscription ----------

  useEffect(() => {
    const pusher = getPusherClient();
    const channel = pusher.subscribe(callChannel(callId));

    channel.bind(
      "status-change",
      (data: { status: string; detail?: string; timestamp: string }) => {
        setStatus(data.status as CallStatus);
        if (data.detail) setNavDetail(data.detail);
        if (data.status === "connected") {
          setConnectedAt(data.timestamp || new Date().toISOString());
        }
      }
    );

    channel.bind(
      "call-ended",
      (data: { status: string; endedReason: string; endedAt?: string }) => {
        setStatus(data.status as CallStatus);
        setEndedReason(data.endedReason);
        if (data.endedAt) setEndedAt(data.endedAt);
      }
    );

    channel.bind("transcript", (data: TranscriptLine) => {
      setTranscriptLines((prev) => [...prev, data]);
    });

    // Connection state monitoring
    pusher.connection.bind(
      "state_change",
      (states: { current: string; previous: string }) => {
        setIsConnected(states.current === "connected");
      }
    );

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(callChannel(callId));
    };
  }, [callId]);

  // ---------- Transcript auto-scroll ----------

  useEffect(() => {
    if (isTranscriptOpen && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcriptLines, isTranscriptOpen]);

  // ---------- Cancel handler ----------

  const handleCancel = useCallback(async () => {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this call?"
    );
    if (!confirmed) return;

    setIsCancelling(true);
    try {
      const res = await fetch("/api/call/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error("Cancel failed:", data.error);
      }
      // Status update will arrive via Pusher
    } catch (err) {
      console.error("Cancel error:", err);
    } finally {
      setIsCancelling(false);
    }
  }, [callId]);

  // ---------- Computed values ----------

  const isActive = isActiveStatus(status);
  const isEnded = status === "completed" || status === "failed";
  const isFailed = status === "failed" || (isEnded && endedReason && endedReason !== "manually-canceled" && !["completed"].includes(endedReason));
  const showSummary = isEnded;

  const statusDisplay = STATUS_DISPLAY[status];
  const description =
    status === "dialing"
      ? `Calling ${ispName}...`
      : status === "connected"
        ? `Connected with ${ispName} agent`
        : statusDisplay.description;

  // Calculate call duration for summary
  const durationDisplay = (() => {
    if (!startedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    const seconds = Math.max(0, Math.floor((end - start) / 1000));
    return formatDuration(seconds);
  })();

  // Retry URL for failed calls
  const retryUrl = `/confirm?isp=${encodeURIComponent(ispSlug)}&category=${encodeURIComponent(categorySlug)}${userNote ? `&note=${encodeURIComponent(userNote)}` : ""}`;

  // Whether to show retry (only for non-cancellation failures)
  const showRetry =
    isEnded &&
    endedReason !== "manually-canceled" &&
    status !== "completed";

  return (
    <div className="space-y-6">
      {/* Reconnecting banner */}
      {!isConnected && (
        <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
          <WifiOff className="h-4 w-4" />
          Reconnecting...
        </div>
      )}

      {/* Agent Found animation */}
      {status === "agent_detected" && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-xl border-2 border-green-500 bg-green-50 p-6 text-center dark:bg-green-950/30">
          <div className="flex items-center justify-center gap-2">
            <span className="relative flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-green-500" />
            </span>
            <h2 className="text-xl font-bold text-green-700 dark:text-green-400">
              Agent Found!
            </h2>
          </div>
          <p className="mt-2 text-sm text-green-600 dark:text-green-500">
            A live agent has picked up. Preparing to connect you...
          </p>
        </div>
      )}

      {/* Transferring / Connecting You animation */}
      {status === "transferring" && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-xl border-2 border-indigo-500 bg-indigo-50 p-6 text-center dark:bg-indigo-950/30">
          <div className="flex items-center justify-center gap-3">
            <PhoneCall className="h-6 w-6 animate-pulse text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xl font-bold text-indigo-700 dark:text-indigo-400">
              Connecting You...
            </h2>
          </div>
          <p className="mt-2 text-sm text-indigo-600 dark:text-indigo-500">
            Calling you back now. Pick up your phone!
          </p>
        </div>
      )}

      {/* Connected state with timer */}
      {status === "connected" && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 rounded-xl border-2 border-green-500 bg-green-50 p-6 text-center dark:bg-green-950/30">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            <h2 className="text-xl font-bold text-green-700 dark:text-green-400">
              Connected
            </h2>
          </div>
          <p className="mt-2 text-sm text-green-600 dark:text-green-500">
            Connected with {ispName} agent
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-green-700 dark:text-green-400">
            <Clock className="h-4 w-4" />
            <span className="text-lg font-semibold tabular-nums">
              {formatDuration(connectedSeconds)}
            </span>
          </div>
        </div>
      )}

      {/* Status header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          {isActive && status !== "agent_detected" && status !== "transferring" && status !== "connected" && (
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
            </span>
          )}
          {isEnded && status === "completed" && endedReason !== "manually-canceled" && (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          )}
          {(status === "failed" || endedReason === "manually-canceled") && (
            <XCircle className="h-5 w-5 text-muted-foreground" />
          )}
          <h1 className="text-2xl font-bold tracking-tight">
            {statusDisplay.label}
          </h1>
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        {status === "navigating" && navDetail && (
          <p className="text-center text-xs text-muted-foreground">{navDetail}</p>
        )}
      </div>

      {/* Step progression (only show during active call) */}
      {!showSummary && (
        <nav
          aria-label="Call progress"
          className="flex items-center justify-center gap-2"
        >
          {CALL_STEPS.map((step, i) => {
            const state = getStepState(step.key, status);
            return (
              <div key={step.key} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <span
                    className={cn(
                      "flex items-center justify-center rounded-full transition-all",
                      state === "current" &&
                        "h-4 w-4 bg-primary ring-2 ring-primary/30 ring-offset-2 ring-offset-background",
                      state === "completed" && "h-3 w-3 bg-primary",
                      state === "upcoming" &&
                        "h-3 w-3 border-2 border-muted-foreground/30 bg-transparent"
                    )}
                  />
                  <span
                    className={cn(
                      "hidden text-[10px] md:block",
                      state === "current" && "font-medium text-foreground",
                      state === "completed" && "text-muted-foreground",
                      state === "upcoming" && "text-muted-foreground/50"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {i < CALL_STEPS.length - 1 && (
                  <div
                    className={cn(
                      "mb-4 hidden h-px w-8 md:block",
                      state === "completed"
                        ? "bg-primary"
                        : "bg-muted-foreground/20"
                    )}
                  />
                )}
              </div>
            );
          })}
        </nav>
      )}

      {/* Hold / navigating timer */}
      {(status === "on_hold" || status === "navigating") && (
        <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span className="text-sm tabular-nums">{formatDuration(holdSeconds)}</span>
        </div>
      )}

      {/* Summary card (when call ends) */}
      {showSummary && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Call Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Result */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Result</span>
              <span className="text-sm font-medium">
                {getEndedReasonDisplay(endedReason).label}
              </span>
            </div>

            {endedReason &&
              endedReason !== "manually-canceled" &&
              status !== "completed" && (
                <p className="text-xs text-muted-foreground">
                  {getEndedReasonDisplay(endedReason).description}
                </p>
              )}

            {/* Duration */}
            {durationDisplay && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Duration</span>
                <span className="text-sm font-medium tabular-nums">
                  {durationDisplay}
                </span>
              </div>
            )}

            <div className="border-t" />

            {/* ISP */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Provider</span>
              <div className="flex items-center gap-2">
                <div className="relative h-5 w-12">
                  <Image
                    src={ispLogoUrl}
                    alt={`${ispName} logo`}
                    fill
                    className="object-contain"
                  />
                </div>
                <span className="text-sm font-medium">{ispName}</span>
              </div>
            </div>

            {/* Category */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Issue</span>
              <span className="text-sm font-medium">{categoryLabel}</span>
            </div>

            {/* Note */}
            {userNote && (
              <div className="flex items-start justify-between gap-4">
                <span className="shrink-0 text-sm text-muted-foreground">
                  Note
                </span>
                <span className="text-right text-sm">{userNote}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Collapsible transcript panel (hidden when connected -- AI is off the call) */}
      {isActive && status !== "connected" && transcriptLines.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
            className="flex w-full items-center justify-between rounded-lg border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <span>Live Transcript ({transcriptLines.length})</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                isTranscriptOpen && "rotate-180"
              )}
            />
          </button>
          {isTranscriptOpen && (
            <div className="max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-3 space-y-1.5">
              {transcriptLines.map((line, i) => (
                <div key={i} className="text-xs">
                  <span
                    className={cn(
                      "font-medium",
                      line.role === "assistant"
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {line.role === "assistant" ? "AI" : "Phone"}:
                  </span>{" "}
                  <span className="text-muted-foreground">{line.text}</span>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {/* Cancel button (during active call) */}
        {isActive && (
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isCancelling}
            className="w-full"
          >
            {isCancelling ? (
              <>
                <Loader2 className="animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <PhoneOff />
                Cancel Call
              </>
            )}
          </Button>
        )}

        {/* Try Again (for failed calls, not manual cancellation) */}
        {showRetry && (
          <Button asChild className="w-full">
            <Link href={retryUrl}>
              <Phone />
              Try Again
            </Link>
          </Button>
        )}

        {/* Start New Call (for all ended calls) */}
        {isEnded && (
          <Button
            variant={showRetry ? "outline" : "default"}
            asChild
            className="w-full"
          >
            <Link href="/select-isp">
              <Phone />
              Start New Call
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
