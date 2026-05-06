"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Method = "google" | "email" | "phone";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  void searchParams;
  const [method, setMethod] = useState<Method>("google");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setError(null);
    setOtpSent(false);
    setEmailSent(false);
    setOtp("");
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "https://www.googleapis.com/auth/gmail.compose",
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setLoading(false);
    if (authError) setError(authError.message);
    else setEmailSent(true);
  }

  async function handlePhoneSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    // Normalize: strip non-digits then prepend + if missing
    const normalized = phone.trim().startsWith("+") ? phone.trim() : `+1${phone.replace(/\D/g, "")}`;
    const { error: authError } = await supabase.auth.signInWithOtp({ phone: normalized });
    setLoading(false);
    if (authError) setError(authError.message);
    else setOtpSent(true);
  }

  async function handleOtpVerify(e: React.FormEvent) {
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
    if (authError) {
      setError(authError.message);
    } else {
      window.location.href = "/";
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Roster Manager</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Youth sports team management</p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm dark:shadow-none border border-gray-200 dark:border-gray-700 p-8">

          {/* Method tabs */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm mb-6">
            {(["google", "email", "phone"] as Method[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMethod(m); reset(); }}
                className={`flex-1 py-2 capitalize transition-colors ${
                  method === m
                    ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                {m === "google" ? "Google" : m === "email" ? "Email" : "Phone"}
              </button>
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 rounded-lg px-3 py-2 mb-4">{error}</p>
          )}

          {/* Google */}
          {method === "google" && (
            <div className="space-y-3">
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                <GoogleIcon />
                {loading ? "Redirecting…" : "Sign in with Google"}
              </button>
              <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                Includes Gmail draft access
              </p>
            </div>
          )}

          {/* Email */}
          {method === "email" && (
            emailSent ? (
              <div className="text-center">
                <div className="text-4xl mb-3">📬</div>
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Check your email</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Magic link sent to <strong>{email}</strong>
                </p>
                <button onClick={reset} className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  Try again
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmail} className="space-y-3">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Sending…" : "Send magic link"}
                </button>
              </form>
            )
          )}

          {/* Phone */}
          {method === "phone" && (
            otpSent ? (
              <form onSubmit={handleOtpVerify} className="space-y-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Code sent to <strong>{phone}</strong>
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="6-digit code"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 tracking-widest text-center text-lg font-mono"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Verifying…" : "Verify code"}
                </button>
                <button type="button" onClick={reset} className="w-full text-sm text-gray-500 dark:text-gray-400 hover:underline">
                  Use a different number
                </button>
              </form>
            ) : (
              <form onSubmit={handlePhoneSend} className="space-y-3">
                <input
                  type="tel"
                  required
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loading ? "Sending…" : "Send code"}
                </button>
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                  US numbers auto-prefixed with +1
                </p>
              </form>
            )
          )}

        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
