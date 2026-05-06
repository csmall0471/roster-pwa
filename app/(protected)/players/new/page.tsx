import Link from "next/link";
import PlayerForm from "../_components/PlayerForm";
import { createPlayer } from "../actions";

export default function NewPlayerPage() {
  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <Link href="/players" className="text-sm text-blue-600 hover:underline">
          ← Back to players
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Add player</h1>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <PlayerForm action={createPlayer} />
      </div>
    </div>
  );
}
