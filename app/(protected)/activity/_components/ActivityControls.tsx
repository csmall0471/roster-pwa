"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useTransition } from "react"

export type ParentOption = { id: string; first_name: string; last_name: string }

export default function ActivityControls({
  parents,
  currentParentId,
  currentEvent,
}: {
  parents: ParentOption[]
  currentParentId: string | null
  currentEvent: string | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [refreshing, startRefresh] = useTransition()

  function buildUrl(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    return `${pathname}?${params.toString()}`
  }

  function handleParentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(buildUrl({ parent_id: e.target.value || null }))
  }

  function handleRefresh() {
    startRefresh(() => { router.refresh() })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={currentParentId ?? ""}
        onChange={handleParentChange}
        className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white px-3 py-1.5 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All parents</option>
        {parents.map((p) => (
          <option key={p.id} value={p.id}>
            {p.first_name} {p.last_name}
          </option>
        ))}
      </select>

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        <span className={refreshing ? "animate-spin inline-block" : ""}>↻</span>
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  )
}
