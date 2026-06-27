import { google } from "@ai-sdk/google";
import { streamText } from "ai";
import { auth } from "@clerk/nextjs/server";
import { aiRequestSchema } from "@/lib/validators/document";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a helpful writing assistant integrated into a collaborative document editor. 
You help users improve their writing by providing clear, concise, and professional suggestions.
Always respond with the improved text directly — do not include explanations unless asked.
Maintain the original meaning and tone unless specifically asked to change it.`;

const ACTION_PROMPTS: Record<string, string> = {
  improve:
    "Improve the following text. Make it clearer, more concise, and more professional while keeping the same meaning:",
  "fix-grammar":
    "Fix all grammar, spelling, and punctuation errors in the following text. Keep the meaning exactly the same:",
  summarize:
    "Summarize the following text in a concise paragraph. Capture the key points:",
  expand:
    "Expand the following text with more detail, examples, and explanations while keeping the same tone:",
  simplify:
    "Simplify the following text. Use shorter sentences and simpler words while keeping the same meaning:",
  translate: "Translate the following text to",
  custom: "", // User provides their own prompt
};

export async function POST(req: Request) {
  // Authenticate
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Validate & parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const result = aiRequestSchema.safeParse(body);
  if (!result.success) {
    return new Response(
      JSON.stringify({ error: result.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { action, prompt, context, language } = result.data;

  // Build the prompt
  let fullPrompt: string;
  if (action === "custom") {
    fullPrompt = prompt;
  } else if (action === "translate") {
    fullPrompt = `${ACTION_PROMPTS[action]} ${language || "English"}:\n\n${context || prompt}`;
  } else {
    fullPrompt = `${ACTION_PROMPTS[action]}\n\n${context || prompt}`;
  }

  // Stream response from Gemini
  const response = streamText({
    model: google("gemini-2.0-flash"),
    system: SYSTEM_PROMPT,
    prompt: fullPrompt,
  });

  return response.toDataStreamResponse();
}
