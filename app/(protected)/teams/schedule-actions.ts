"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notifyCoachSignupChange, sendSnackConfirmation } from "@/lib/notifications";
import { logActivity } from "@/lib/activity";
import { track } from "@vercel/analytics/server";

// ── Admin: game management ────────────────────────────────────────────────────

type GameData = {
  game_date: string;
  game_time: string | null;
  event_type: string;
  title: string | null;
  opponent: string | null;
  location: string | null;
  is_home: boolean;
  notes: string | null;
};

export async function createGame(teamId: string, data: GameData) {
  const supabase = await createClient();
  const { error } = await supabase.from("games").insert({ team_id: teamId, ...data });
  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return { error: null };
}

export async function importEvents(
  teamId: string,
  events: GameData[]
): Promise<{ error: string | null; count: number }> {
  const supabase = await createClient();
  const rows = events.map((e) => ({ team_id: teamId, ...e }));
  const { error } = await supabase.from("games").insert(rows);
  if (error) return { error: error.message, count: 0 };
  revalidatePath(`/teams/${teamId}`);
  return { error: null, count: events.length };
}

export async function updateGame(gameId: string, teamId: string, data: GameData) {
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
    .select("parent_id, parents(first_name, last_name, email)")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!parentLink) return { error: "Not a parent account" };

  const { data: game } = await supabase
    .from("games")
    .select("id, game_date, game_time, opponent, location, is_home, team_id, teams(name, snack_slots_per_game)")
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

  logActivity(parentLink.parent_id, "snack_signup", { game_id: gameId, game_date: (game as any).game_date, opponent: (game as any).opponent, team: (game as any).teams?.name }).catch(() => {});
  track("snack_signup", { team: (game as any).teams?.name ?? null, opponent: (game as any).opponent ?? null }).catch(() => {});

  const parent     = parentLink.parents as any;
  const gameTeam   = game.teams as any;
  const parentName = parent ? `${parent.first_name} ${parent.last_name}` : "A parent";

  notifyCoachSignupChange({
    type: "signup",
    parentName,
    teamName: gameTeam?.name ?? "your team",
    gameDate: game.game_date,
    opponent: game.opponent,
  }).catch((err) => console.error("[notify] claimSnackSlot coach:", err));

  if (parent?.email) {
    sendSnackConfirmation({
      type: "signup",
      parentEmail: parent.email,
      parentFirstName: parent.first_name ?? "there",
      teamName: gameTeam?.name ?? "your team",
      opponent: game.opponent,
      isHome: game.is_home,
      gameDate: game.game_date,
      gameTime: game.game_time,
      location: game.location,
      teamId: game.team_id,
    }).catch((err) => console.error("[notify] claimSnackSlot parent:", err));
  }

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
      parents(first_name, last_name, email),
      games(game_date, game_time, opponent, location, is_home, team_id, teams(name))
    `)
    .eq("id", signupId)
    .single();

  const { error } = await supabase.from("snack_signups").delete().eq("id", signupId);
  if (error) return { error: error.message };

  if (signup) {
    const parent     = signup.parents as any;
    if ((signup as any).parent_id) {
      const game = signup.games as any
      logActivity((signup as any).parent_id, "snack_cancel", { game_date: game?.game_date, opponent: game?.opponent, team: game?.teams?.name }).catch(() => {})
      track("snack_cancel", { team: game?.teams?.name ?? null, opponent: game?.opponent ?? null }).catch(() => {})
    }
    const game       = signup.games as any;
    const parentName = parent ? `${parent.first_name} ${parent.last_name}` : "A parent";

    notifyCoachSignupChange({
      type: "cancel",
      parentName,
      teamName: game?.teams?.name ?? "your team",
      gameDate: game?.game_date,
      opponent: game?.opponent ?? null,
    }).catch((err) => console.error("[notify] cancelSnackSlot coach:", err));

    if (parent?.email && game?.game_date) {
      sendSnackConfirmation({
        type: "cancel",
        parentEmail: parent.email,
        parentFirstName: parent.first_name ?? "there",
        teamName: game?.teams?.name ?? "your team",
        opponent: game?.opponent ?? null,
        isHome: game?.is_home ?? true,
        gameDate: game.game_date,
        gameTime: game?.game_time ?? null,
        location: game?.location ?? null,
        teamId: game.team_id,
      }).catch((err) => console.error("[notify] cancelSnackSlot parent:", err));
    }

    const teamId = game?.team_id;
    revalidatePath("/parent");
    if (teamId) revalidatePath(`/parent/team/${teamId}`);
  }

  return { error: null };
}
