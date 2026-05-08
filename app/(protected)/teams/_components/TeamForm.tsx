"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { TeamFormState } from "../actions";
import type { Team } from "@/lib/types";

interface Props {
  team?: Team;
  action: (prev: TeamFormState, formData: FormData) => Promise<TeamFormState>;
}

const SPORTS = ["Basketball", "Soccer", "Baseball", "Softball", "Volleyball", "Flag Football", "Lacrosse", "Other"];
const ORGS   = ["CCV", "I9", "Jr. Suns", "Wholistic"];

export default function TeamForm({ team, action }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      {/* Team name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Team name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={team?.name ?? ""}
          placeholder="e.g. Showtime"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Organization */}
      <div>
        <label htmlFor="organization" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Organization
        </label>
        <input
          id="organization"
          name="organization"
          list="org-list"
          defaultValue={team?.organization ?? ""}
          placeholder="e.g. CCV, Jr. Suns, Wholistic"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <datalist id="org-list">
          {ORGS.map((o) => <option key={o} value={o} />)}
        </datalist>
      </div>

      {/* Sport */}
      <div>
        <label htmlFor="sport" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Sport
        </label>
        <select
          id="sport"
          name="sport"
          defaultValue={team?.sport ?? ""}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select a sport</option>
          {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Age group */}
      <div>
        <label htmlFor="age_group" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Age group
        </label>
        <input
          id="age_group"
          name="age_group"
          defaultValue={team?.age_group ?? ""}
          placeholder="e.g. U10, U12, 5th grade"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Season label */}
      <div>
        <label htmlFor="season" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Season label
        </label>
        <input
          id="season"
          name="season"
          defaultValue={team?.season ?? ""}
          placeholder="e.g. Spring 2026"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Season dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="season_start" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Season start
          </label>
          <input
            id="season_start"
            name="season_start"
            type="date"
            defaultValue={team?.season_start ?? ""}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="season_end" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Season end
          </label>
          <input
            id="season_end"
            name="season_end"
            type="date"
            defaultValue={team?.season_end ?? ""}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Mojo code */}
      <div>
        <label htmlFor="mojo_code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Mojo team code
        </label>
        <div className="flex items-center gap-2">
          <input
            id="mojo_code"
            name="mojo_code"
            defaultValue={team?.mojo_code ?? ""}
            placeholder="e.g. W1N73R7"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono uppercase"
          />
        </div>
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          The invite code from your Mojo team link (get.mojo.sport/team-invite?code=…)
        </p>
      </div>

      {/* Snack signup */}
      <div>
        <label htmlFor="snack_signup_url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Snack signup link
        </label>
        <input
          id="snack_signup_url"
          name="snack_signup_url"
          type="url"
          defaultValue={team?.snack_signup_url ?? ""}
          placeholder="https://www.signupgenius.com/…"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : team ? "Save changes" : "Create team"}
        </button>
        <Link
          href="/teams"
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-5 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
