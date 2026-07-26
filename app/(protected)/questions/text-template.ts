// The pre-filled body for the "Text parents" button. Coaches can override it
// per list (question_sets.message_template); this is the fallback.
export const DEFAULT_TEXT_TEMPLATE =
  "Hi! A few quick things for {player}:\n{questions}\nThanks!";

export const TEMPLATE_TOKENS = [
  { token: "{player}", hint: "kid's first name" },
  { token: "{questions}", hint: "the questions, as a bulleted list" },
] as const;

// Render a coach's template into an SMS body.
//   {player}    → the kid's first name
//   {questions} → the prompts, one bulleted line each
// An empty/blank template falls back to DEFAULT_TEXT_TEMPLATE.
export function renderTextTemplate(
  template: string | null | undefined,
  vars: { player: string; prompts: string[] }
): string {
  const tpl = template && template.trim() ? template : DEFAULT_TEXT_TEMPLATE;
  const questionsBlock = vars.prompts.map((p) => `• ${p}`).join("\n");
  return tpl.split("{player}").join(vars.player).split("{questions}").join(questionsBlock);
}
