import LoginForm from "@/app/_components/LoginForm";

const FEATURES = [
  { icon: "📅", title: "Game Schedule",     desc: "See upcoming games, locations, and times at a glance." },
  { icon: "🍎", title: "Snack Signup",      desc: "Claim a snack slot for your kid's game in one tap." },
  { icon: "🏋️", title: "Training Sessions", desc: "Browse and register for skill-building sessions." },
  { icon: "👤", title: "Player Profile",    desc: "Manage your child's info, jersey, and season history." },
];

export default function LoginPage() {
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
        </div>

        {/* Feature highlights (family-facing) */}
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-3">
              <span className="text-xl">{f.icon}</span>
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 mt-1">{f.title}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{f.desc}</p>
            </div>
          ))}
        </div>

        <LoginForm defaultNext="/parent/dashboard" />

        {/* Access note */}
        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500 leading-relaxed px-2">
          Access is by invitation only. Your phone number must be on file with your child&apos;s team. Contact your coach if you need help.
        </p>

        {/* Compliance footer */}
        <div className="mt-6 pt-5 border-t border-gray-200 dark:border-gray-700 flex justify-center items-center gap-5 text-xs text-gray-400 dark:text-gray-500">
          <a href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">Privacy Policy</a>
          <a href="/sms-terms" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">SMS Terms</a>
          <a href="mailto:csmall0471@gmail.com" className="hover:text-gray-600 dark:hover:text-gray-300 hover:underline transition-colors">Contact</a>
          {/* Discreet staff entry → coach Google OAuth sign-in. */}
          <a
            href="/admin"
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
