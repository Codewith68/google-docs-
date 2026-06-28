import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

async function main() {
  try {
    const response = streamText({
      model: google("gemini-2.5-flash"),
      prompt: "Hello",
    });

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
    }
    console.log("\n--- Stream Done ---");
  } catch (error) {
    console.error("AI SDK Error:", error);
  }
}

main();
