export const metadata = {
  title: "Privacy Policy — Roster Manager",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12 font-sans text-gray-800">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: May 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Who we are</h2>
        <p className="text-gray-700 leading-relaxed">
          This application is operated by Connor Small, a youth sports coach managing
          team rosters, schedules, and parent communications for organizations including
          CCV, Jr. Suns, and Wholistic. This is a private tool used to coordinate with
          the parents and guardians of players on coached teams.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Information we collect</h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-700 leading-relaxed">
          <li>Player names, dates of birth, and jersey information</li>
          <li>Parent and guardian names, phone numbers, and email addresses</li>
          <li>Team and season records</li>
          <li>Player season card photos uploaded by the coach</li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          All information is provided directly by the coach or collected from parents
          during team registration. We do not collect information from third parties
          or use tracking technologies.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">How we use your information</h2>
        <ul className="list-disc pl-5 space-y-2 text-gray-700 leading-relaxed">
          <li>To organize and manage youth sports team rosters</li>
          <li>To contact parents and guardians about team schedules, practice times, game updates, and cancellations via SMS and email</li>
          <li>To associate season card photos with the correct player records</li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          We do not sell, share, or disclose personal information to any third parties.
          Information is never used for marketing purposes unrelated to team communications.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">SMS messaging</h2>
        <p className="text-gray-700 leading-relaxed mb-3">
          Parents and guardians who provide a phone number during team registration
          consent to receive SMS text messages from the team coach. Messages are
          limited to team-related communications such as:
        </p>
        <ul className="list-disc pl-5 space-y-2 text-gray-700 leading-relaxed">
          <li>Game and practice schedule updates</li>
          <li>Cancellations or location changes</li>
          <li>Team announcements</li>
        </ul>
        <p className="mt-3 text-gray-700 leading-relaxed">
          Message frequency varies by season activity. Message and data rates may apply.
        </p>
        <p className="mt-3 text-gray-700 leading-relaxed">
          <strong>To opt out:</strong> Reply <strong>STOP</strong> to any message at
          any time. You will receive one confirmation message and no further messages
          will be sent. To re-enroll, reply <strong>START</strong>.
        </p>
        <p className="mt-3 text-gray-700 leading-relaxed">
          <strong>For help:</strong> Reply <strong>HELP</strong> or contact the coach
          directly at csmall0471@gmail.com.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Data storage and security</h2>
        <p className="text-gray-700 leading-relaxed">
          Data is stored securely using Supabase with row-level security. Only the
          authenticated coach account can access player and parent records. Photos
          are stored in Supabase Storage with access restricted to the account owner.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Data retention</h2>
        <p className="text-gray-700 leading-relaxed">
          Records are retained for the duration of a player's participation in coached
          teams and may be kept for historical season records thereafter. You may
          request removal of your information at any time by contacting the coach.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Contact</h2>
        <p className="text-gray-700 leading-relaxed">
          For any privacy questions or to request removal of your information:<br />
          <a href="mailto:csmall0471@gmail.com" className="text-blue-600 underline">
            csmall0471@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
