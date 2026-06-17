"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// A roster admin only has access to the Roster Creator. RLS already keeps them
// out of the coach's other data, but this keeps them on the right page rather
// than landing on empty coach screens.
export default function ScopedAdminGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname.startsWith("/tools/roster-creator")) {
      router.replace("/tools/roster-creator");
    }
  }, [pathname, router]);

  return null;
}
