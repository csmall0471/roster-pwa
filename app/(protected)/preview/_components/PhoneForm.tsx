"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PhoneForm({ defaultPhone = "" }: { defaultPhone?: string }) {
  const [phone, setPhone] = useState(defaultPhone);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (digits.length < 7) return;
    router.push(`/preview?phone=${encodeURIComponent(phone.trim())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm">
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Parent phone number"
        className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 transition-colors"
      >
        Preview
      </button>
    </form>
  );
}
