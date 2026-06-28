const fs = require('fs');
const dotenv = require('dotenv');

// Parse the .env file manually
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const apiKey = envConfig.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
  console.log("No API key found in .env");
  process.exit(1);
}

fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey)
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      console.error("API Error:", data.error);
    } else {
      console.log("Available Models:");
      data.models.forEach(m => console.log(m.name, " - ", m.supportedGenerationMethods));
    }
  })
  .catch(err => console.error("Fetch Error:", err));
