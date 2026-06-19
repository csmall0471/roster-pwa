"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// A scoped tool user (granted specific tools, not a coach) is held to exactly
// the tools they were granted. RLS already keeps them out of the coach's other
// data, but this keeps them on the right pages rather than landing on empty
// coach screens. `allowedPaths` are the granted tools' base hrefs.
export default function ScopedAdminGuard({ allowedPaths }: { allowedPaths: string[] }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const ok = allowedPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!ok && allowedPaths.length > 0) {
      router.replace(allowedPaths[0]);
    }
  }, [pathname, router, allowedPaths]);

  return null;
}
