import Link from "next/link";
import TeamForm from "../_components/TeamForm";
import { createTeam } from "../actions";

export default function NewTeamPage() {
  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/teams" className="text-sm text-blue-600 hover:underline">
          ← Back to teams
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">New team</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <TeamForm action={createTeam} />
      </div>
    </div>
  );
}
