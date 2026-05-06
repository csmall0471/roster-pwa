"use server";

import Anthropic from "@anthropic-ai/sdk";

export type DraftResult =
  | { channel: "email"; subject: string; body: string }
  | { channel: "text"; body: string };

export async function draftMessage(
  prompt: string,
  channel: "email" | "text"
): Promise<DraftResult & { error?: string }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  if (channel === "email") {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are helping a youth sports coach write a parent email.
Write a clear, friendly email based on this description: "${prompt}"
Respond with ONLY valid JSON, no other text:
{"subject":"...","body":"..."}
The body should be plain text, 2–4 short paragraphs, no HTML.`,
        },
      ],
    });

    const raw =
      response.content[0].type === "text" ? response.content[0].text : "";
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : null;
      if (parsed?.subject && parsed?.body) {
        return { channel: "email", subject: parsed.subject, body: parsed.body };
      }
    } catch {
      // fall through
    }
    return { channel: "email", subject: "", body: raw, error: "Parsing failed — raw text shown" };
  } else {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `You are helping a youth sports coach write a text message to parents.
Write a brief, friendly text message based on: "${prompt}"
Aim for under 160 characters. Plain text only. Respond with just the message, nothing else.`,
        },
      ],
    });

    const body =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";
    return { channel: "text", body };
  }
}
