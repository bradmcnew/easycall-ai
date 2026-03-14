"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Loader2 } from "lucide-react";

interface LiveAudioPlayerProps {
  listenUrl: string;
  isActive: boolean;
}

type ConnectionState = "idle" | "connecting" | "playing" | "error";

export function LiveAudioPlayer({ listenUrl, isActive }: LiveAudioPlayerProps) {
  const [state, setState] = useState<ConnectionState>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  }, []);

  // Auto-disconnect when call ends
  useEffect(() => {
    if (!isActive && state !== "idle") {
      cleanup();
      setState("idle");
    }
  }, [isActive, state, cleanup]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const toggleListening = useCallback(async () => {
    if (state === "playing" || state === "connecting") {
      cleanup();
      setState("idle");
      return;
    }

    setState("connecting");

    try {
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;

      await audioCtx.audioWorklet.addModule("/pcm-player-processor.js");

      const workletNode = new AudioWorkletNode(audioCtx, "pcm-player-processor");
      workletNode.connect(audioCtx.destination);
      workletNodeRef.current = workletNode;

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const ws = new WebSocket(listenUrl);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => setState("playing");

      ws.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;

        // Stream is 16kHz stereo PCM16 LE (interleaved L/R).
        // Mix both channels to mono so we hear both the IVR and our bot.
        const pcm16 = new DataView(event.data);
        const stereoSamples = event.data.byteLength / 2;
        const monoSamples = stereoSamples / 2;
        const float32 = new Float32Array(monoSamples);

        for (let i = 0; i < monoSamples; i++) {
          const left = pcm16.getInt16(i * 4, true) / 32768;
          const right = pcm16.getInt16(i * 4 + 2, true) / 32768;
          float32[i] = left + right;
        }

        workletNode.port.postMessage(float32, [float32.buffer]);
      };

      ws.onerror = () => {
        cleanup();
        setState("error");
      };

      ws.onclose = () => {
        setState((prev) => (prev === "error" ? "error" : "idle"));
        if (workletNodeRef.current) {
          workletNodeRef.current.disconnect();
          workletNodeRef.current = null;
        }
        if (audioCtxRef.current) {
          audioCtxRef.current.close();
          audioCtxRef.current = null;
        }
      };
    } catch {
      cleanup();
      setState("error");
    }
  }, [state, listenUrl, cleanup]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleListening}
      disabled={state === "connecting"}
      className="gap-2"
    >
      {state === "connecting" ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting...
        </>
      ) : state === "playing" ? (
        <>
          <VolumeX className="h-4 w-4" />
          Stop Listening
        </>
      ) : (
        <>
          <Volume2 className="h-4 w-4" />
          {state === "error" ? "Retry Listen" : "Listen In"}
        </>
      )}
    </Button>
  );
}
