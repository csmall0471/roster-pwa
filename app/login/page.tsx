"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const FEATURES = [
  {
    icon: "📅",
    title: "Game Schedule",
    desc: "See upcoming games, locations, and times at a glance.",
  },
  {
    icon: "🍎",
    title: "Snack Signup",
    desc: "Claim a snack slot for your kid's game in one tap.",
  },
  {
    icon: "🏋️",
    title: "Training Sessions",
    desc: "Browse and register for skill-building sessions.",
  },
  {
    icon: "👤",
    title: "Player Profile",
    desc: "Manage your child's info, jersey, and season history.",
  },
];

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const normalized = phone.trim().startsWith("+") ? phone.trim() : `+1${phone.replace(/\D/g, "")}`;
    const { error: authError } = await supabase.auth.signInWithOtp({ phone: normalized });
    setLoading(false);
    if (authError) setError(authError.message);
    else setOtpSent(true);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const normalized = phone.trim().startsWith("+") ? phone.trim() : `+1${phone.replace(/\D/g, "")}`;
    const { error: authError } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: otp.trim(),
      type: "sms",
    });
    setLoading(false);
    if (authError) setError(authError.message);
    else {
      const next = new URLSearchParams(window.location.search).get("next");
      const dest = next && next.startsWith("/") ? next : "/parent/dashboard";
      window.location.href = `/api/login-done?next=${encodeURIComponent(dest)}`;
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-orange-50 via-white to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-900 px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 text-3xl shadow-md mb-4 select-none">
            🏀
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Coach Connor&apos;s<br />Player Manager
          </h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
            The private portal for CCV, Jr. Suns &amp; Wholistic families
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3"
            >
              <span className="text-xl">{f.icon}</span>
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 mt-1">{f.title}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Sign-in card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            {otpSent ? "Enter your verification code" : "Sign in with your phone number"}
          </h2>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 rounded-lg px-3 py-2 mb-4">{error}</p>
          )}

          {otpSent ? (
            <form onSubmit={handleVerify} className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                A 6-digit code was sent to <strong className="text-gray-700 dark:text-gray-300">{phone}</strong>.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoComplete="one-time-code"
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="000000"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2.5 text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 tracking-[0.4em] text-center text-xl font-mono"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Verifying…" : "Verify & sign in"}
              </button>
              <button
                type="button"
                onClick={() => { setOtpSent(false); setOtp(""); setError(null); }}
                className="w-full text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors"
              >
                Use a different number
              </button>
            </form>
          ) : (
            <form onSubmit={handleSend} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  Phone number
                </label>
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending…" : "Send verification code"}
              </button>
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                We&apos;ll text you a one-time code. US numbers only.
              </p>
            </form>
          )}
        </div>

        {/* Access note */}
        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500 leading-relaxed px-2">
          Access is by invitation only. Your phone number must be on file with your child&apos;s team. Contact your coach if you need help.
        </p>

        {/* Compliance footer */}
        <div className="mt-6 pt-5 border-t border-gray-200 dark:border-gray-700 flex justify-center items-center gap-5 text-xs text-gray-400 dark:text-gray-500">
          <a href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">
            Privacy Policy
          </a>
          <a href="/sms-terms" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">
            SMS Terms
          </a>
          <a href="mailto:csmall0471@gmail.com" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">
            Contact
          </a>
          {/* Discreet staff entry — sets the post-login redirect to the admin
              dashboard so coaches don't have to type the URL. Reads as a
              decorative dot to anyone else. */}
          <a
            href="/login?next=/teams"
            aria-label="Staff"
            title="Staff"
            className="text-gray-200 dark:text-gray-800 hover:text-gray-500 dark:hover:text-gray-400 transition-colors select-none"
          >
            ·
          </a>
        </div>
      </div>
    </div>
  );
}
