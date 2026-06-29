"use client";

import { useEffect, useRef, useState } from "react";

// Finger/mouse signature pad. Draws onto a transparent canvas, trims to the
// drawn area, and hands back a transparent PNG data URL for placement on the
// card front. Ink color is selectable so it stays visible on light or dark cards.

type Ink = "black" | "white";

export default function SignaturePad({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const dpr = useRef(1);
  const [ink, setInk] = useState<Ink>("black");
  const [hasInk, setHasInk] = useState(false);

  const inkColor = ink === "white" ? "#ffffff" : "#0a0a0a";

  // Size the canvas backing store to its CSS box × devicePixelRatio for crisp lines.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    dpr.current = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr.current);
    canvas.height = Math.round(rect.height * dpr.current);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr.current, dpr.current);
      ctx.lineWidth = 2.6;
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
    last.current = pos(e);
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.strokeStyle = inkColor;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  }

  function end() {
    drawing.current = false;
    last.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  // Crop to the drawn bounding box so the placed signature isn't a huge mostly-
  // empty rectangle, then export a transparent PNG.
  function done() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width,
      minY = height,
      maxX = 0,
      maxY = 0,
      found = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return;
    const pad = Math.round(6 * dpr.current);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    out.getContext("2d")!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
    onDone(out.toDataURL("image/png"));
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
