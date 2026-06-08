"use client";

import { useState } from "react";

export default function SmsOptInPage() {
  const [phone, setPhone] = useState("");
  const [checked, setChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!checked) {
      // We don't block use of any service — this page's only purpose is the
      // optional SMS opt-in itself. The hint just tells the user to tick the
      // box if that's what they came here for.
      setError("To sign up for SMS reminders, please tick the consent box. Reminders are optional — you can use cssports-az.com without opting in.");
      return;
    }
    setError(null);
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-orange-50 to-white dark:from-gray-950 dark:to-gray-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3 select-none">🏀🏀🏀</div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">CS Sports AZ</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Optional SMS reminders from Coach Connor
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-500 leading-relaxed">
            SMS reminders are entirely optional. The team roster app and all
            its features (signing up for snacks, registering for training,
            viewing schedules) work the same without opting in here.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                You&apos;re signed up for SMS reminders!
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You&apos;ll receive reminders before games and training sessions.
                Reply <strong>STOP</strong> at any time to opt out.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="phone"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Mobile phone number
                </label>
                <input
                  id="phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-start gap-3">
                <input
                  id="consent"
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                />
                <label htmlFor="consent" className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  I agree to receive SMS reminder messages from CS Sports AZ about
                  upcoming games, snack duties, and training sessions for my player&apos;s
                  team. Message frequency varies (typically 1–3 messages per week during
                  the season). Message &amp; data rates may apply. Reply{" "}
                  <strong>STOP</strong> to cancel or <strong>HELP</strong> for help.
                </label>
              </div>

              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}

              <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Yes, sign me up for reminders!
              </button>

              <p className="text-xs text-gray-400 dark:text-gray-500 text-center leading-relaxed">
                By submitting, you confirm consent to receive recurring automated
                SMS messages from CS Sports AZ. This is not a condition of any purchase.
              </p>
            </form>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex justify-center gap-6 text-xs text-gray-400 dark:text-gray-500">
          <a href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">
            Privacy Policy
          </a>
          <a href="/sms-terms" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">
            SMS Terms
          </a>
          <a href="mailto:csmall0471@gmail.com" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">
            Contact
          </a>
        </div>
      </div>
    </div>
  );
}
