import { createBrowserClient } from "@supabase/ssr";

function assertEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || url.includes("your-project-id")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Fill in .env.local and restart the dev server."
    );
  }
  if (!key || key === "your-anon-key-here") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Fill in .env.local and restart the dev server."
    );
  }
  return { url, key };
}

export function createClient() {
  const { url, key } = assertEnv();
  return createBrowserClient(url, key);
}
