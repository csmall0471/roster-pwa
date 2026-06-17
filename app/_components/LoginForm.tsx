"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// The phone-OTP sign-in card, shared by the family login (/login) and the roster
// admin login (/roster-login). The ONLY difference between those entries is the
// surrounding copy and where you land — the auth mechanism is identical here.
export default function LoginForm({ defaultNext }: { defaultNext: string }) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalize = () => (phone.trim().startsWith("+") ? phone.trim() : `+1${phone.replace(/\D/g, "")}`);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({ phone: normalize() });
    setLoading(false);
    if (authError) setError(authError.message);
    else setOtpSent(true);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.verifyOtp({ phone: normalize(), token: otp.trim(), type: "sms" });
    setLoading(false);
    if (authError) setError(authError.message);
    else {
      const next = new URLSearchParams(window.location.search).get("next");
      const dest = next && next.startsWith("/") ? next : defaultNext;
      window.location.href = `/api/login-done?next=${encodeURIComponent(dest)}`;
    }
  }

  return (
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
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center leading-relaxed">
            We&apos;ll text you a one-time code to verify the number. US numbers only. This is for sign-in
            verification only and is <strong>not</strong> SMS reminder opt-in — you will not receive any
            reminders unless you opt in separately inside the app.
          </p>
        </form>
      )}
    </div>
  );
}
