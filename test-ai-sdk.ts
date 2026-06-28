import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

async function main() {
  const models = ['gemini-1.5-flash-latest', 'gemini-pro', 'gemini-1.5-pro'];
  for (const m of models) {
    try {
      console.log(`Testing ${m}...`);
      const response = await generateText({
        model: google(m),
        prompt: "Hello",
      });
      console.log(`SUCCESS for ${m}:`, response.text);
      break;
    } catch (error: any) {
      console.error(`FAILED for ${m}:`, error.message);
    }
  }
}

main();
