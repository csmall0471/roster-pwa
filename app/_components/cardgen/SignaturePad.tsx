"use client";

import { useEffect, useRef, useState } from "react";
import {
  renderSignaturePng,
  DEFAULT_SIG_THICKNESS,
  type SigStroke,
} from "./signature-render";

// Finger/mouse signature pad. Draws onto a transparent canvas for live feedback
// but ALSO keeps the raw strokes (normalized so x=1 = the signature width). It
// hands those strokes back with the rendered PNG so the editor can recolor or
// re-thicken the signature later without a redraw. See signature-render.ts.

type Ink = "black" | "white";

export type SignatureResult = {
  dataUrl: string;
  strokes: SigStroke[];
  color: string;
  thickness: number;
};

export default function SignaturePad({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (sig: SignatureResult) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const pts = useRef<{ x: number; y: number }[]>([]);
  // Completed strokes, normalized by the canvas CSS width (aspect preserved).
  const strokes = useRef<SigStroke[]>([]);
  const cssW = useRef(1);
  const dpr = useRef(1);
  const [ink, setInk] = useState<Ink>("black");
  const [hasInk, setHasInk] = useState(false);

  const inkColor = ink === "white" ? "#ffffff" : "#0a0a0a";

  // Size the canvas backing store to its CSS box × devicePixelRatio for crisp lines.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    cssW.current = rect.width || 1;
    dpr.current = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr.current);
    canvas.height = Math.round(rect.height * dpr.current);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr.current, dpr.current);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    }
  }, []);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    pts.current = [pos(e)];
  }

  // Smooth the stroke: draw quadratic curves through the midpoints of recent
  // points (control = the real point), which rounds off the jagged segments you
  // get from connecting raw samples with straight lines.
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const a = pts.current;
    a.push(pos(e));
    ctx.strokeStyle = inkColor;
    if (a.length === 2) {
      ctx.beginPath();
      ctx.moveTo(a[0].x, a[0].y);
      ctx.lineTo(a[1].x, a[1].y);
      ctx.stroke();
    } else if (a.length >= 3) {
      const n = a.length;
      const p0 = a[n - 3];
      const p1 = a[n - 2];
      const p2 = a[n - 1];
      const m1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const m2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(m1.x, m1.y);
      ctx.quadraticCurveTo(p1.x, p1.y, m2.x, m2.y);
      ctx.stroke();
    }
    if (!hasInk) setHasInk(true);
  }

  function end() {
    drawing.current = false;
    if (pts.current.length) {
      const w = cssW.current || 1;
      const r = (v: number) => Math.round((v / w) * 1e4) / 1e4;
      strokes.current.push(pts.current.map((p) => ({ x: r(p.x), y: r(p.y) })));
    }
    pts.current = [];
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.current = [];
    pts.current = [];
    setHasInk(false);
  }

  // Re-render from the retained strokes (not the live canvas) so the output is
  // identical to a later restyle, then hand back both the PNG and the strokes.
  function done() {
    if (strokes.current.length === 0) return;
    const dataUrl = renderSignaturePng(strokes.current, inkColor, DEFAULT_SIG_THICKNESS);
    onDone({
      dataUrl,
      strokes: strokes.current,
      color: inkColor,
      thickness: DEFAULT_SIG_THICKNESS,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Sign with your finger</h3>
          <div className="flex gap-1">
            {(["black", "white"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setInk(c)}
                className={`h-7 w-7 rounded-full border-2 ${
                  ink === c ? "border-blue-500" : "border-gray-300 dark:border-gray-600"
                }`}
                style={{ background: c === "white" ? "#fff" : "#0a0a0a" }}
                aria-label={`${c} ink`}
              />
            ))}
          </div>
        </div>

        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          className="w-full h-44 rounded-lg border border-gray-300 dark:border-gray-700 touch-none"
          style={{ background: ink === "white" ? "#374151" : "#f9fafb" }}
        />

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={clear}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Clear
          </button>
          <button
            onClick={onCancel}
            className="ml-auto rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={done}
            disabled={!hasInk}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add to card
          </button>
        </div>
      </div>
    </div>
  );
}
