"use client";

import { useState } from "react";

const PETAL_COLORS = ["#FFB7C5", "#FF8FA8", "#FFC8D4", "#FFD6DF", "#FF9EB5", "#FFADC0"];

function randomSetup() {
  const count = 7 + Math.floor(Math.random() * 7); // 7–13 petals
  const startsWithGets = Math.random() < 0.5;
  return { count, startsWithGets };
}

export default function HousePage() {
  const [setup, setSetup] = useState(() => randomSetup());
  const [removedSet, setRemovedSet] = useState<Set<number>>(new Set());
  const [fallingSet, setFallingSet] = useState<Set<number>>(new Set());

  const { count, startsWithGets } = setup;
  const removedCount = removedSet.size;
  const done = removedCount === count;

  // Last petal determines outcome
  const getsHouse = (count - 1) % 2 === 0 ? startsWithGets : !startsWithGets;

  // Phrase shown after the most recent pluck
  const currentGets: boolean | null =
    removedCount > 0
      ? (removedCount - 1) % 2 === 0
        ? startsWithGets
        : !startsWithGets
      : null;

  function pluck(i: number) {
    if (removedSet.has(i) || fallingSet.has(i) || done) return;
    setFallingSet((prev) => new Set([...prev, i]));
    setTimeout(() => {
      setRemovedSet((prev) => new Set([...prev, i]));
      setFallingSet((prev) => { const n = new Set(prev); n.delete(i); return n; });
    }, 420);
  }

  function reset() {
    setSetup(randomSetup());
    setRemovedSet(new Set());
    setFallingSet(new Set());
  }

  const visiblePetals = Array.from({ length: count }, (_, i) => i).filter(
    (i) => !removedSet.has(i)
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-100 to-green-50 flex flex-col items-center justify-center p-8 select-none">
      <h1 className="text-3xl font-bold text-purple-700 mb-1 text-center">🌸 The House Oracle 🌸</h1>
      <p className="text-sm text-gray-400 mb-10 text-center">click the petals, one by one…</p>

      {!done && (
        <>
          {/* Flower */}
          <div className="relative mb-10" style={{ width: 220, height: 220 }}>
            {visiblePetals.map((i) => {
              const theta = (i / count) * 2 * Math.PI;
              const r = 72;
              const cx = Math.sin(theta) * r;
              const cy = -Math.cos(theta) * r;
              const rotDeg = (i / count) * 360;
              const isFalling = fallingSet.has(i);
              const color = PETAL_COLORS[i % PETAL_COLORS.length];

              return (
                <div
                  key={i}
                  onClick={() => pluck(i)}
                  style={{
                    position: "absolute",
                    left: `calc(50% + ${cx}px - 15px)`,
                    top: `calc(50% + ${cy}px - 30px)`,
                    width: 30,
                    height: 60,
                    borderRadius: "50%",
                    background: color,
                    transformOrigin: "15px 30px",
                    transform: isFalling
                      ? `rotate(${rotDeg + 60}deg) translate(12px, 20px)`
                      : `rotate(${rotDeg}deg)`,
                    opacity: isFalling ? 0 : 1,
                    transition: "opacity 0.4s ease, transform 0.4s ease",
                    cursor: "pointer",
                    boxShadow: "inset 0 -5px 10px rgba(0,0,0,0.08)",
                    zIndex: 1,
                  }}
                />
              );
            })}

            {/* Center circle */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "radial-gradient(circle at 38% 32%, #FFE566, #FFB300)",
                zIndex: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                boxShadow: "0 3px 12px rgba(0,0,0,0.12)",
              }}
            >
              🌼
            </div>
          </div>

          {/* Current phrase */}
          <div className="text-center min-h-16 flex items-center justify-center px-4">
            {currentGets === null ? (
              <p className="text-gray-400 text-sm animate-pulse">👆 tap a petal to begin</p>
            ) : currentGets ? (
              <p className="text-2xl font-bold text-green-600">Connor gets his house! 🏠</p>
            ) : (
              <p className="text-2xl font-bold text-rose-500">Connor doesn&apos;t get his house… 😢</p>
            )}
          </div>

          {/* Petal counter */}
          {removedCount > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              {visiblePetals.length} petal{visiblePetals.length !== 1 ? "s" : ""} left
            </p>
          )}
        </>
      )}

      {/* Result */}
      {done && (
        <div className="text-center space-y-5 max-w-sm">
          {getsHouse ? (
            <>
              <div className="text-8xl animate-bounce">🥳</div>
              <h2 className="text-4xl font-black text-green-600 leading-tight">
                Connor gets his house!
              </h2>
              <div className="text-6xl flex items-center justify-center gap-3">
                <span>😊</span>
                <span>🏡</span>
                <span>🎉</span>
              </div>
              <p className="text-gray-500">The petals have spoken. It is decided.</p>
            </>
          ) : (
            <>
              <div className="text-8xl">😤</div>
              <h2 className="text-4xl font-black text-rose-600 leading-tight">
                Connor doesn&apos;t get his house…
              </h2>
              <div className="text-5xl flex items-center justify-center gap-2">
                <span>😤</span>
                <span className="text-2xl text-gray-400">——</span>
                <span>🥚</span>
                <span className="text-2xl text-gray-400">——›</span>
                <span>🏠</span>
                <span>💥</span>
              </div>
              <p className="text-gray-500">better luck next time, buddy.</p>
            </>
          )}

          <button
            onClick={reset}
            className="mt-4 px-6 py-3 bg-purple-500 hover:bg-purple-600 active:scale-95 text-white font-semibold rounded-2xl shadow-md transition-all text-lg"
          >
            🌸 Try again
          </button>
        </div>
      )}
    </div>
  );
}
