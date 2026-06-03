export const metadata = {
  title: "SMS Consent & Terms — CS Sports AZ",
};

export default function SmsTermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 font-sans text-gray-800">
      <p className="mb-6">
        <a href="/" className="text-sm text-blue-600 underline">
          ← Back to CS Sports AZ
        </a>
      </p>
      <h1 className="text-3xl font-bold mb-2">SMS Consent &amp; Terms</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: June 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Who sends these messages</h2>
        <p className="text-gray-700 leading-relaxed">
          SMS messages are sent by <strong>CS Sports AZ</strong> (Connor Small,
          operator), a youth basketball coaching service in the Phoenix metro
          area of Arizona. Programs include Christ&apos;s Church of the Valley
          (CCV) Sports, the Jr. Suns developmental league, and Wholistic
          Basketball. Messages go to parents and guardians of players on
          coached teams who have explicitly opted in.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          How parents opt in (web)
        </h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          Opt-in is collected inside the app at{" "}
          <a href="https://cssports-az.com" className="text-blue-600 underline">
            cssports-az.com
          </a>
          . The flow:
        </p>
        <ol className="list-decimal pl-5 space-y-2 text-gray-700 leading-relaxed">
          <li>
            A parent signs in with their phone number using a one-time SMS
            verification code (this verifies ownership of the number but is{" "}
            <em>not</em> by itself opt-in to the SMS reminders program).
          </li>
          <li>
            When the parent claims a snack slot for an upcoming game, or
            registers their player for a training session, they see an
            unchecked checkbox labeled <strong>&ldquo;Text me the day before&rdquo;</strong>{" "}
            inside the signup form.
          </li>
          <li>
            Directly next to or below that checkbox the parent sees the
            following disclosure verbatim:
          </li>
        </ol>
        <blockquote className="mt-3 ml-4 pl-4 border-l-4 border-gray-300 text-gray-700 italic leading-relaxed">
          By checking &ldquo;Text me the day before&rdquo; you agree to receive
          recurring automated SMS reminders from CS Sports AZ about your
          player&apos;s team activities. Message frequency varies. Message
          &amp; data rates may apply. Reply <strong>STOP</strong> to opt out,{" "}
          <strong>HELP</strong> for help. See{" "}
          <a href="/privacy" className="text-blue-600 underline">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/sms-terms" className="text-blue-600 underline">
            SMS Terms
          </a>
          .
        </blockquote>
        <ol
          start={4}
          className="list-decimal pl-5 space-y-2 text-gray-700 leading-relaxed mt-3"
        >
          <li>
            Submitting the form with the box ticked is the affirmative opt-in
            action. The checkbox is unchecked by default; the user must
            actively check it.
          </li>
          <li>
            Parents may also opt in directly at{" "}
            <a href="/sms-opt-in" className="text-blue-600 underline">
              cssports-az.com/sms-opt-in
            </a>{" "}
            using the same consent language.
          </li>
        </ol>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Phone numbers entered for sign-in purposes are <strong>not</strong>{" "}
          automatically opted in to the reminders program. SMS reminder
          subscription is per-action (each snack signup, each training
          registration) and only stored when the consent checkbox has been
          ticked.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          Welcome / opt-in confirmation message
        </h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          Upon successful opt-in, the parent receives:
        </p>
        <blockquote className="ml-4 pl-4 border-l-4 border-gray-300 text-gray-700 italic">
          CS Sports AZ: You&apos;re signed up for SMS reminders. Msg freq
          varies. Msg&amp;Data rates may apply. Reply HELP for help, STOP to
          cancel. cssports-az.com/sms-terms
        </blockquote>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What messages are sent</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          Messages are strictly limited to team-related, transactional
          communications, including:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-gray-700 leading-relaxed">
          <li>
            Snack-duty reminders the day before a game the parent has signed
            up to bring snacks for
          </li>
          <li>
            Training session reminders the day before a session their player
            is registered for
          </li>
          <li>
            Upcoming game schedule reminders for their player&apos;s team
          </li>
          <li>
            Occasional notifications when a new training session is posted
          </li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Messages are <strong>never</strong> sent for marketing or promotional
          purposes. Message frequency varies by season — typically 1–4
          messages per week during active season and fewer in the off-season.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Sample messages</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          Verbatim examples (placeholders shown in brackets):
        </p>
        <div className="space-y-3">
          {[
            "CS Sports AZ: Reminder — you signed up to bring snacks for [Team Name] vs [Opponent] tomorrow ([Day, Month Date] at [H:MM AM/PM]). Location: [Venue]. Manage your signup: cssports-az.com/parent/team/[id]?tab=schedule. Reply STOP to opt out.",
            "CS Sports AZ: Reminder — [Player Name] is registered for [Session Title] tomorrow ([Day, Month Date] at [H:MM AM/PM]) at [Location]. Manage registration: cssports-az.com/parent/training. Reply STOP to opt out.",
            "CS Sports AZ: Upcoming game for [Team Name] — [Day, Month Date] at [H:MM AM/PM] [vs/at] [Opponent], [Location]. View schedule: cssports-az.com/parent/team/[id]?tab=schedule. Reply STOP to opt out.",
            "CS Sports AZ: A new training session ([Session Title]) has been posted for [Date] at [H:MM AM/PM]. Register at cssports-az.com/parent/training. Reply STOP to opt out.",
          ].map((msg, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 leading-relaxed font-mono"
            >
              {msg}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How to opt out</h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-700 leading-relaxed">
          <li>
            Reply <strong>STOP</strong> (or STOPALL, CANCEL, END, QUIT,
            UNSUBSCRIBE, REVOKE, OPTOUT) to any message. You will receive one
            confirmation and no further messages will be sent to that number.
          </li>
          <li>
            Reply <strong>HELP</strong> (or INFO) to any message for
            assistance.
          </li>
          <li>
            Email{" "}
            <a
              href="mailto:csmall0471@gmail.com"
              className="text-blue-600 underline"
            >
              csmall0471@gmail.com
            </a>{" "}
            to request removal.
          </li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          To re-enroll after opting out, reply <strong>START</strong> or
          contact the coach directly.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">
          Opt-out confirmation message
        </h2>
        <blockquote className="ml-4 pl-4 border-l-4 border-gray-300 text-gray-700 italic">
          You have successfully been unsubscribed. You will not receive any
          more messages from this number. Reply START to resubscribe.
        </blockquote>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">HELP response message</h2>
        <blockquote className="ml-4 pl-4 border-l-4 border-gray-300 text-gray-700 italic">
          CS Sports AZ youth team reminders. Msg freq varies. Msg&amp;Data
          rates may apply. Reply STOP to opt out. Help: csmall0471@gmail.com.
        </blockquote>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Message and data rates</h2>
        <p className="text-gray-700 leading-relaxed">
          Standard message and data rates from your carrier may apply. This
          service does not charge any additional fees for SMS messages.
          Carriers are not liable for delayed or undelivered messages.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Privacy</h2>
        <p className="text-gray-700 leading-relaxed">
          Phone numbers and SMS consent are used solely for team
          communications and are <strong>never</strong> sold, shared, or
          disclosed to third parties or affiliates for marketing purposes. See
          the full{" "}
          <a href="/privacy" className="text-blue-600 underline">
            Privacy Policy
          </a>{" "}
          for details on storage and protection.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Contact</h2>
        <p className="text-gray-700 leading-relaxed">
          Questions about SMS consent, opt-in/opt-out, or removal requests:
          <br />
          <a
            href="mailto:csmall0471@gmail.com"
            className="text-blue-600 underline"
          >
            csmall0471@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
