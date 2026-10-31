import type { CardDesign } from "@/lib/types";
import { SPORTS } from "./sports";
import { TEMPLATES } from "./templates";

// The card_design for a draft that only has a photo so far. It carries what the
// editor would auto-fill on picking this player, so opening the draft shows the
// kid's name, team and stats. cutout_url stays "" until the editor removes the
// photo's background.
export function buildPhotoDraftDesign(
  target: {
    firstName: string;
    lastName: string;
    teamName: string | null;
    season: string | null;
    ageGroup: string | null;
    jersey: string | null;
    playerAge: string | null;
    assistantCoaches?: string | null;
    sport?: CardDesign["sport"];
  },
  photoUrl: string
): CardDesign {
  const sport = target.sport ?? "basketball";
  return {
    cutout_url: "",
    source_photo_url: photoUrl,
    sport,
    background: {
      type: "template",
      id: sport === "basketball" ? TEMPLATES[0].id : SPORTS[sport].defaultBackgroundId,
    },
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    text: {
      team_name: (target.teamName ?? "").toUpperCase(),
      age_group: target.ageGroup,
      season: target.season,
      name_line1: target.firstName.toUpperCase(),
      name_line2: target.lastName.toUpperCase(),
      color_scheme: "light",
    },
    back: {
      stats: {
        position: "",
        height: "",
        jersey: target.jersey ?? "",
        age: target.playerAge ?? "",
        favorite_team: "",
        favorite_player: "",
        signature_move: "",
        favorite_drill: "",
        biggest_fan: "",
        loudest_parent: "",
        hype_song: "",
        coach: "",
        assistant_coaches: target.assistantCoaches ?? "",
      },
      scouting_report: "",
      look_alike: "",
    },
  };
}
