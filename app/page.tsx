import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Public landing page. Provides the business context that A2P/CTIA reviewers
// expect to see when they visit the bare domain, instead of bouncing them
// straight into a login form. Authenticated visitors are redirected through
// to the app proper.
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/teams");

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-white text-gray-800">
      {/* Header */}
      <header className="max-w-5xl mx-auto px-6 pt-10 pb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-500 text-2xl shadow-md select-none">
            🏀
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 leading-tight">
              CS Sports AZ
            </p>
            <p className="text-xs text-gray-500 leading-tight">
              Coach Connor&apos;s Player Manager
            </p>
          </div>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Parent sign in →
        </Link>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-6 pb-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">
          Youth basketball coaching and team management for Phoenix-area families.
        </h1>
        <p className="mt-4 text-lg text-gray-600 leading-relaxed">
          CS Sports AZ is the team roster, schedule, snack-signup, and training-
          session platform run by Coach Connor Small for youth basketball
          programs in the Valley, including Christ&apos;s Church of the Valley
          (CCV) Sports, the Jr. Suns developmental league, and Wholistic
          Basketball.
        </p>
      </section>

      {/* What we do */}
      <section className="max-w-4xl mx-auto px-6 pb-12">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          What this site does
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              icon: "📅",
              title: "Game & practice schedules",
              desc:
                "Parents see upcoming games, practices, and locations for their kid's team in one place.",
            },
            {
              icon: "🍎",
              title: "Snack signups",
              desc:
                "Parents claim a snack slot for an upcoming game. A reminder goes out the day before.",
            },
            {
              icon: "🏋️",
              title: "Training sessions",
              desc:
                "Parents browse and register their player for optional skills sessions. A reminder goes out the day before.",
            },
            {
              icon: "👤",
              title: "Player profiles",
              desc:
                "Roster, jersey number, season history, and team photos in one place.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="text-2xl">{f.icon}</div>
              <p className="font-semibold text-gray-900 mt-2">{f.title}</p>
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* SMS program — the critical block for A2P review */}
      <section className="max-w-3xl mx-auto px-6 pb-12">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-2">SMS reminders</h2>
          <p className="text-sm text-gray-500 mb-6">
            How the text-message program works on this site
          </p>

          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            What messages parents receive
          </h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700 mb-6">
            <li>Snack-duty reminders the day before a game they signed up for</li>
            <li>Training session reminders the day before a session their player is registered for</li>
            <li>Upcoming game schedule reminders for their player&apos;s team</li>
            <li>Occasional notifications when a new training session is posted</li>
          </ul>
          <p className="text-sm text-gray-600 leading-relaxed mb-6">
            Messages are sent <strong>only</strong> for events the parent has
            actively signed up for or is on the roster for. No marketing, no
            promotions. Frequency is typically <strong>1–4 messages per week</strong>{" "}
            during active season and fewer in the off-season.
          </p>

          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            How parents opt in
          </h3>
          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            Each time a parent signs up for a snack slot or registers their
            player for a training session inside the app, they see an unchecked
            <span className="font-semibold"> &ldquo;Text me the day before&rdquo;</span>{" "}
            checkbox alongside the email option. Ticking that checkbox is the
            consent action. Below the checkbox the parent sees the disclosure:
          </p>
          <blockquote className="border-l-4 border-blue-500 pl-4 py-2 bg-blue-50 text-sm text-gray-700 italic mb-4">
            By checking &ldquo;Text me the day before&rdquo; you agree to receive
            recurring automated SMS reminders from CS Sports AZ about your
            player&apos;s team activities. Message frequency varies. Message
            &amp; data rates may apply. Reply <strong>STOP</strong> to opt out,{" "}
            <strong>HELP</strong> for help. See{" "}
            <Link href="/privacy" className="text-blue-600 underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/sms-terms" className="text-blue-600 underline">
              SMS Terms
            </Link>
            .
          </blockquote>
          <p className="text-sm text-gray-700 leading-relaxed mb-6">
            The checkbox is unchecked by default, and SMS consent is per-action
            (snack signup or training session), not a blanket marketing list.
            Parents can also use the dedicated{" "}
            <Link href="/sms-opt-in" className="text-blue-600 underline">
              SMS sign-up form
            </Link>{" "}
            to opt in to reminders broadly.
          </p>

          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Sample messages parents receive
          </h3>
          <div className="space-y-3 mb-6">
            {[
              "CS Sports AZ: Reminder — you signed up to bring snacks for Wildcats vs Hawks tomorrow (Sat, Oct 4 at 10:30 AM). Location: CCV Avondale. Manage your signup: cssports-az.com/parent/team/abc?tab=schedule. Reply STOP to opt out.",
              "CS Sports AZ: Reminder — Trey is registered for Ball-Handling Skills tomorrow (Mon, Oct 6 at 5:00 PM) at CCV Peoria Gym. Manage registration: cssports-az.com/parent/training. Reply STOP to opt out.",
              "CS Sports AZ: Upcoming game for Wildcats — Sat, Oct 11 at 11:00 AM vs Suns Jr., Phoenix Sports Complex. View schedule: cssports-az.com/parent/team/abc?tab=schedule. Reply STOP to opt out.",
              "CS Sports AZ: A new training session (Shooting Fundamentals) has been posted for Wed, Oct 15 at 5:30 PM. Register at cssports-az.com/parent/training. Reply STOP to opt out.",
            ].map((msg, i) => (
              <div
                key={i}
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-700 leading-relaxed font-mono"
              >
                {msg}
              </div>
            ))}
          </div>

          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Welcome / confirmation message
          </h3>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-700 leading-relaxed font-mono mb-6">
            CS Sports AZ: You&apos;re signed up for SMS reminders. Msg freq
            varies. Msg&amp;Data rates may apply. Reply HELP for help, STOP to
            cancel. cssports-az.com/sms-terms
          </div>

          <h3 className="text-sm font-semibold text-gray-900 mb-2">STOP / HELP</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700 mb-4">
            <li>
              Reply <strong>STOP</strong> to any message to be unsubscribed
              immediately. One confirmation message is sent, and no further
              messages will be sent to that number.
            </li>
            <li>
              Reply <strong>HELP</strong> to any message for assistance, or email{" "}
              <a
                href="mailto:csmall0471@gmail.com"
                className="text-blue-600 underline"
              >
                csmall0471@gmail.com
              </a>
              .
            </li>
            <li>
              To re-enroll after opting out, reply <strong>START</strong>.
            </li>
          </ul>

          <p className="text-xs text-gray-500 leading-relaxed">
            Message frequency varies. Message &amp; data rates may apply.
            Carriers are not liable for delayed or undelivered messages. SMS
            consent is never shared with third parties or affiliates for
            marketing purposes.
          </p>
        </div>
      </section>

      {/* Contact */}
      <section className="max-w-3xl mx-auto px-6 pb-16">
        <h2 className="text-xl font-bold text-gray-900 mb-3">Contact</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-700 leading-relaxed">
          <p>
            <strong>Connor Small</strong> — Operator and youth basketball coach.
          </p>
          <p className="mt-2">
            Email:{" "}
            <a
              href="mailto:csmall0471@gmail.com"
              className="text-blue-600 underline"
            >
              csmall0471@gmail.com
            </a>
          </p>
          <p className="mt-2">
            Service area: Phoenix metro, Arizona (Avondale, Peoria, Surprise,
            Buckeye, and surrounding communities).
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-8 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500">
        <p>© {new Date().getFullYear()} CS Sports AZ · Coach Connor Small</p>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-gray-700 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/sms-terms" className="hover:text-gray-700 hover:underline">
            SMS Terms
          </Link>
          <Link href="/sms-opt-in" className="hover:text-gray-700 hover:underline">
            SMS Sign-up
          </Link>
          <a
            href="mailto:csmall0471@gmail.com"
            className="hover:text-gray-700 hover:underline"
          >
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
