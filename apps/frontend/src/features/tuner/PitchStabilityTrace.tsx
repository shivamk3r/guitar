import type { StringTuning } from "@/data/tunings";
import { clamp } from "@/lib/math";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  type PitchTraceSample,
  TRACE_ACCEPTABLE_CENTS,
  TRACE_CENTS_LIMIT,
  TRACE_HISTORY_SECONDS,
  appendRollingTraceSample,
  buildPitchTraceLineSegments,
  prunePitchTraceSamples,
  summarizePitchStability,
} from "./pitch-trace";

export interface PitchStabilityTraceHandle {
  appendSample: (sample: PitchTraceSample) => void;
  setClock: (tSeconds: number) => void;
  reset: () => void;
}

interface Props {
  target: StringTuning | null;
}

const WAITING_SUMMARY = "Waiting for pitch";
const SUMMARY_UPDATE_MS = 250;

export const PitchStabilityTrace = forwardRef<PitchStabilityTraceHandle, Props>(
  function PitchStabilityTrace({ target }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const samplesRef = useRef<PitchTraceSample[]>([]);
    const clockRef = useRef<{ audioTime: number; perfTime: number } | null>(null);
    const summaryRef = useRef(WAITING_SUMMARY);
    const [summary, setSummary] = useState(WAITING_SUMMARY);

    useImperativeHandle(
      ref,
      () => ({
        appendSample(sample) {
          clockRef.current = { audioTime: sample.t, perfTime: performance.now() };
          samplesRef.current = appendRollingTraceSample(samplesRef.current, sample);
        },
        setClock(tSeconds) {
          clockRef.current = { audioTime: tSeconds, perfTime: performance.now() };
          samplesRef.current = prunePitchTraceSamples(samplesRef.current, tSeconds);
        },
        reset() {
          samplesRef.current = [];
          clockRef.current = null;
          summaryRef.current = WAITING_SUMMARY;
          setSummary(WAITING_SUMMARY);
        },
      }),
      [],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const drawingContext: CanvasRenderingContext2D = ctx;
      const canvasElement: HTMLCanvasElement = canvas;

      let frame = 0;
      let lastSummaryUpdate = 0;

      function getNowSeconds() {
        const clock = clockRef.current;
        if (!clock) return samplesRef.current.at(-1)?.t ?? 0;
        return clock.audioTime + (performance.now() - clock.perfTime) / 1000;
      }

      function drawFrame() {
        const nowSeconds = getNowSeconds();
        drawPitchTrace(drawingContext, canvasElement, samplesRef.current, nowSeconds);

        const nowMs = performance.now();
        if (nowMs - lastSummaryUpdate >= SUMMARY_UPDATE_MS) {
          lastSummaryUpdate = nowMs;
          const nextSummary = summarizePitchStability(samplesRef.current, nowSeconds);
          if (nextSummary !== summaryRef.current) {
            summaryRef.current = nextSummary;
            setSummary(nextSummary);
          }
        }

        frame = requestAnimationFrame(drawFrame);
      }

      drawFrame();
      return () => cancelAnimationFrame(frame);
    }, []);

    const targetLabel = target ? `${target.note}${target.octave}` : "Target";

    return (
      <div className="mt-6 pt-5 border-t border-white/10">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-ink">Pitch stability</h2>
            <div className="text-xs text-muted tabular-nums">{targetLabel}</div>
          </div>
          <div className="text-xs text-muted tabular-nums text-right">{summary}</div>
        </div>
        <div className="mt-3 h-44 overflow-hidden rounded-md border border-white/10 bg-surface/60">
          <canvas
            ref={canvasRef}
            className="block h-full w-full"
            role="img"
            aria-label={`Pitch stability trace for ${targetLabel} over the last ${TRACE_HISTORY_SECONDS} seconds`}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-muted tabular-nums">
          <span>-{TRACE_HISTORY_SECONDS}s</span>
          <span>now</span>
        </div>
      </div>
    );
  },
);

function drawPitchTrace(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  samples: PitchTraceSample[],
  nowSeconds: number,
) {
  const { width, height } = prepareCanvas(ctx, canvas);
  const left = 44;
  const right = 14;
  const top = 14;
  const bottom = 24;
  const plotWidth = Math.max(1, width - left - right);
  const plotHeight = Math.max(1, height - top - bottom);

  const xForTime = (t: number) =>
    left + ((t - (nowSeconds - TRACE_HISTORY_SECONDS)) / TRACE_HISTORY_SECONDS) * plotWidth;
  const yForCents = (cents: number) =>
    top +
    ((TRACE_CENTS_LIMIT - clamp(cents, -TRACE_CENTS_LIMIT, TRACE_CENTS_LIMIT)) /
      (TRACE_CENTS_LIMIT * 2)) *
      plotHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#111821";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, plotWidth, plotHeight);
  ctx.clip();

  const acceptableTop = yForCents(TRACE_ACCEPTABLE_CENTS);
  const acceptableBottom = yForCents(-TRACE_ACCEPTABLE_CENTS);
  ctx.fillStyle = "rgba(102, 217, 168, 0.14)";
  ctx.fillRect(left, acceptableTop, plotWidth, acceptableBottom - acceptableTop);

  for (let i = 0; i <= TRACE_HISTORY_SECONDS; i += 1) {
    const x = left + (i / TRACE_HISTORY_SECONDS) * plotWidth;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + plotHeight);
    ctx.stroke();
  }

  for (const cents of [-50, -25, 25, 50]) {
    const y = yForCents(cents);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + plotWidth, y);
    ctx.stroke();
  }

  const centerY = yForCents(0);
  ctx.strokeStyle = "rgba(102, 217, 168, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left, centerY);
  ctx.lineTo(left + plotWidth, centerY);
  ctx.stroke();

  for (const segment of buildPitchTraceLineSegments(samples, nowSeconds)) {
    ctx.strokeStyle = segment.reliable ? "#e9edf1" : "rgba(233, 237, 241, 0.35)";
    ctx.lineWidth = segment.reliable ? 2.25 : 1.75;
    ctx.lineCap = "round";
    ctx.setLineDash(segment.reliable ? [] : [5, 5]);
    ctx.beginPath();
    ctx.moveTo(xForTime(segment.from.t), yForCents(segment.from.cents));
    ctx.lineTo(xForTime(segment.to.t), yForCents(segment.to.cents));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const latest = prunePitchTraceSamples(samples, nowSeconds).at(-1);
  if (latest) {
    ctx.fillStyle = latest.reliable ? "#66d9a8" : "rgba(233, 237, 241, 0.45)";
    ctx.beginPath();
    ctx.arc(xForTime(latest.t), yForCents(latest.cents), latest.reliable ? 3.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  ctx.fillStyle = "#8793a2";
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const cents of [-50, -25, 0, 25, 50]) {
    const prefix = cents > 0 ? "+" : "";
    ctx.fillText(`${prefix}${cents}¢`, left - 8, yForCents(cents));
  }
}

function prepareCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width || canvas.clientWidth || 640);
  const cssHeight = Math.max(1, rect.height || canvas.clientHeight || 176);
  const dpr = window.devicePixelRatio || 1;
  const pixelWidth = Math.floor(cssWidth * dpr);
  const pixelHeight = Math.floor(cssHeight * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: cssWidth, height: cssHeight };
}
