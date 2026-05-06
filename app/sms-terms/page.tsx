export const metadata = {
  title: "SMS Consent & Terms — Roster Manager",
};

export default function SmsTermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 font-sans text-gray-800">
      <h1 className="text-3xl font-bold mb-2">SMS Consent & Terms</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: May 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Who sends these messages</h2>
        <p className="text-gray-700 leading-relaxed">
          SMS messages are sent by Connor Small, a youth sports coach, to parents and
          guardians of players on coached teams. Organizations include CCV, Jr. Suns,
          and Wholistic.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How consent is collected</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          Before any messages are sent, parents and guardians provide explicit consent
          through one of the following methods:
        </p>
        <ul className="list-disc pl-5 space-y-3 text-gray-700 leading-relaxed">
          <li>
            <strong>Paper registration form:</strong> At the beginning of each season,
            parents complete a paper team registration form that includes the following
            statement:
            <blockquote className="mt-2 ml-4 pl-4 border-l-4 border-gray-300 text-gray-600 italic">
              "By providing your phone number, you consent to receive SMS text messages
              from the team coach regarding game schedules, practice updates,
              cancellations, and team announcements. Message and data rates may apply.
              Reply STOP to opt out at any time."
            </blockquote>
          </li>
          <li>
            <strong>Verbal consent:</strong> When parents provide a phone number
            verbally (e.g., at tryouts or a first practice), the coach explains that
            the number will be used to send team-related SMS updates, and the parent
            confirms agreement before the number is recorded.
          </li>
          <li>
            <strong>Text-in opt-in:</strong> Parents may text the coach directly to
            provide their number, which constitutes affirmative opt-in to receive
            team communications.
          </li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Phone numbers are entered into the roster management system only after
          consent has been confirmed. No numbers are added without a parent or
          guardian's knowledge.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">What messages are sent</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          Messages are strictly limited to team-related communications, including:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-gray-700 leading-relaxed">
          <li>Game and practice schedule reminders</li>
          <li>Cancellations or location changes</li>
          <li>Team announcements (e.g., uniform pickup, photo day)</li>
          <li>Important updates from the coach</li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Messages are never sent for marketing, promotions, or purposes unrelated
          to the team. Message frequency varies by season activity — typically
          1–4 messages per week during active season, fewer in the off-season.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How to opt out</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          Consent can be withdrawn at any time using any of these methods:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-gray-700 leading-relaxed">
          <li>
            Reply <strong>STOP</strong> to any message. You will receive one
            confirmation and no further messages will be sent to that number.
          </li>
          <li>
            Reply <strong>HELP</strong> to any message for assistance.
          </li>
          <li>
            Contact the coach directly at{" "}
            <a href="mailto:csmall0471@gmail.com" className="text-blue-600 underline">
              csmall0471@gmail.com
            </a>{" "}
            to request removal.
          </li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          To re-enroll after opting out, reply <strong>START</strong> or contact
          the coach directly.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Message and data rates</h2>
        <p className="text-gray-700 leading-relaxed">
          Standard message and data rates from your carrier may apply. This service
          does not charge any additional fees for SMS messages.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Privacy</h2>
        <p className="text-gray-700 leading-relaxed">
          Phone numbers are used solely for team communications and are never sold,
          shared, or disclosed to third parties. See our full{" "}
          <a href="/privacy" className="text-blue-600 underline">
            Privacy Policy
          </a>{" "}
          for complete details on how information is stored and protected.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Contact</h2>
        <p className="text-gray-700 leading-relaxed">
          Questions about SMS consent or to be removed from the list:<br />
          <a href="mailto:csmall0471@gmail.com" className="text-blue-600 underline">
            csmall0471@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
