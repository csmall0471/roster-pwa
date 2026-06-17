import LoginForm from "@/app/_components/LoginForm";

// Roster admins (people granted Roster-Creator-only access by phone) sign in here.
// Same phone-OTP auth as the family login — just roster-tool framing and none of
// the family feature highlights they don't have access to. After verifying they
// land in the Roster Creator (the protected layout holds them to that one tool).
export default function RosterLoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 via-white to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-900 px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-3xl shadow-md mb-4 select-none">
            🗂️
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Roster Creator</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sign in to build and balance your league&apos;s teams.
          </p>
        </div>

        <LoginForm defaultNext="/tools/roster-creator" />

        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500 leading-relaxed px-2">
          Access is by invitation. Your phone number must be granted Roster Creator access by the league owner.
        </p>

        <div className="mt-6 pt-5 border-t border-gray-200 dark:border-gray-700 flex justify-center items-center gap-5 text-xs text-gray-400 dark:text-gray-500">
          <a href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">Privacy Policy</a>
          <a href="/sms-terms" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">SMS Terms</a>
          <a href="mailto:csmall0471@gmail.com" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">Contact</a>
        </div>
      </div>
    </div>
  );
}
