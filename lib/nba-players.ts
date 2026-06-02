// Curated list of NBA players used for the "Plays Like" feature on card backs.
// Each entry has a short style descriptor so Claude vision can pick a vibe match
// from a still photo — no face recognition involved.

export type NbaPlayer = { name: string; style: string };

export const NBA_PLAYERS: NbaPlayer[] = [
  // Modern stars
  { name: "Stephen Curry", style: "fearless shooter, light on his feet, smiles a lot" },
  { name: "LeBron James", style: "physical, intense, leader on the floor" },
  { name: "Kevin Durant", style: "long limbs, smooth jumper, quiet intensity" },
  { name: "Giannis Antetokounmpo", style: "huge frame, attacks the rim, all energy" },
  { name: "Luka Dončić", style: "crafty, slow-down playmaker, swagger" },
  { name: "Nikola Jokić", style: "big body, surprising passes, looks unbothered" },
  { name: "Jayson Tatum", style: "smooth scorer, calm demeanor" },
  { name: "Devin Booker", style: "polished shooter, focused glare" },
  { name: "Jimmy Butler", style: "scowl, tough, won't back down" },
  { name: "Damian Lillard", style: "deep-range shooter, ice in his veins" },
  { name: "Anthony Edwards", style: "explosive athlete, big personality, fearless" },
  { name: "Ja Morant", style: "small but flies, electric energy, fearless" },
  { name: "Trae Young", style: "small guard, deep shooter, crafty passer" },
  { name: "Donovan Mitchell", style: "compact athlete, aggressive scorer" },
  { name: "Kawhi Leonard", style: "stoic, defensive monster, big hands" },
  { name: "Joel Embiid", style: "huge body, dominant, theatrical" },
  { name: "Tyrese Haliburton", style: "tall point guard, savvy passer, smiles" },
  { name: "Shai Gilgeous-Alexander", style: "calm, smooth, mid-range maestro" },
  { name: "Victor Wembanyama", style: "freakishly tall, wiry, alien skill set" },
  { name: "Paolo Banchero", style: "big strong forward, smooth scorer" },
  { name: "Tyler Herro", style: "shooter with swagger, confident off-the-dribble" },
  { name: "De'Aaron Fox", style: "lightning-fast point guard" },
  { name: "Ja'Marr Pickett", style: "tough wing defender" },
  // Legends for fun matches
  { name: "Michael Jordan", style: "ultimate competitor, intense glare, tongue out at the rim" },
  { name: "Magic Johnson", style: "big smile, tall point guard, makes everyone better" },
  { name: "Larry Bird", style: "trash-talking shooter, smart, calm under pressure" },
  { name: "Kobe Bryant", style: "killer instinct, focused stare, footwork master" },
  { name: "Allen Iverson", style: "small but fearless, crossovers, headband swag" },
  { name: "Tim Duncan", style: "fundamentals, quiet leader, banked it off the glass" },
  { name: "Shaquille O'Neal", style: "biggest kid on the court, big personality" },
];
