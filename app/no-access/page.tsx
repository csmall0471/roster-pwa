import Link from "next/link";

export default function NoAccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Account not found</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Your phone number or email isn't linked to any players in the system.
          Contact your coach to make sure your contact info is entered correctly.
        </p>
        <Link
          href="/login"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
