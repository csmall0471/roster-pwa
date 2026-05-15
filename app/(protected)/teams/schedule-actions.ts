"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyCoachSignupChange } from "@/lib/notifications";

// ── Admin: game management ────────────────────────────────────────────────────

export async function createGame(
  teamId: string,
  data: {
    game_date: string;
    game_time: string | null;
    opponent: string | null;
    location: string | null;
    is_home: boolean;
    notes: string | null;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("games").insert({ team_id: teamId, ...data });
  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

export async function updateGame(
  gameId: string,
  teamId: string,
  data: {
    game_date: string;
    game_time: string | null;
    opponent: string | null;
    location: string | null;
    is_home: boolean;
    notes: string | null;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("games").update(data).eq("id", gameId);
  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

export async function deleteGame(gameId: string, teamId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("games").delete().eq("id", gameId);
  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

export async function updateTeamSnackSettings(
  teamId: string,
  data: { snack_signup_enabled: boolean; snack_slots_per_game: number }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("teams").update(data).eq("id", teamId);
  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

// ── Parent: claim / cancel snack slot ────────────────────────────────────────

export async function claimSnackSlot(
  gameId: string,
  reminderEmail: boolean,
  reminderSms: boolean
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id, parents(first_name, last_name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!parentLink) return { error: "Not a parent account" };

  const { data: game } = await supabase
    .from("games")
    .select("id, game_date, opponent, team_id, teams(name, snack_slots_per_game)")
    .eq("id", gameId)
    .single();
  if (!game) return { error: "Game not found" };

  const slotsPerGame = (game.teams as any)?.snack_slots_per_game ?? 1;

  const { count } = await supabase
    .from("snack_signups")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId);

  if ((count ?? 0) >= slotsPerGame) return { error: "No slots available" };

  const { data: existing } = await supabase
    .from("snack_signups")
    .select("slot_number")
    .eq("game_id", gameId)
    .order("slot_number", { ascending: false })
    .limit(1);

  const nextSlot = (existing?.[0]?.slot_number ?? 0) + 1;

  const { error } = await supabase.from("snack_signups").insert({
    game_id: gameId,
    parent_id: parentLink.parent_id,
    slot_number: nextSlot,
    reminder_email: reminderEmail,
    reminder_sms: reminderSms,
  });
  if (error) return { error: error.message };

  const parent = parentLink.parents as any;
  await notifyCoachSignupChange({
    type: "signup",
    parentName: `${parent.first_name} ${parent.last_name}`,
    teamName: (game.teams as any)?.name ?? "your team",
    gameDate: game.game_date,
    opponent: game.opponent,
  });

  revalidatePath("/parent");
  revalidatePath(`/parent/team/${game.team_id}`);
  return { error: null };
}

export async function cancelSnackSlot(signupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: signup } = await supabase
    .from("snack_signups")
    .select(`
      parent_id,
      parents(first_name, last_name),
      games(game_date, opponent, team_id, teams(name))
    `)
    .eq("id", signupId)
    .single();

  const { error } = await supabase.from("snack_signups").delete().eq("id", signupId);
  if (error) return { error: error.message };

  if (signup) {
    const parent = signup.parents as any;
    const game   = signup.games as any;
    await notifyCoachSignupChange({
      type: "cancel",
      parentName: `${parent?.first_name} ${parent?.last_name}`,
      teamName: game?.teams?.name ?? "your team",
      gameDate: game?.game_date,
      opponent: game?.opponent ?? null,
    });
    const teamId = game?.team_id;
    revalidatePath("/parent");
    if (teamId) revalidatePath(`/parent/team/${teamId}`);
  }

  return { error: null };
}
