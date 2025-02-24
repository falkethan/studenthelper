const fs = require("fs");
const path = require("path");
const { Configuration, OpenAIApi } = require("openai");

// Load scraped finance data
const financeDataPath = path.join(__dirname, "scraped_finance_data.json");
let financeData = [];
if (fs.existsSync(financeDataPath)) {
  financeData = JSON.parse(fs.readFileSync(financeDataPath, "utf-8"));
} else {
  console.error("⚠️ scraped_finance_data.json not found!");
}

exports.handler = async (event, context) => {
  try {
    // Ensure it's a POST request
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Parse the request body
    const { conversation } = JSON.parse(event.body);

    // Find relevant scraped finance data (simple search)
    //let relevantArticles = financeData
    //  .filter(article => article.title.toLowerCase().includes(prompt.toLowerCase()))
    //  .slice(0, 3); // Return top 3 relevant articles

    //let extraInfo = relevantArticles.length
    //  ? `Here are some articles you might find useful:\n${relevantArticles
    //      .map(article => `- [${article.title}](${article.url})`)
    //      .join("\n")}`
    //  : "";

    // ✅ Debug Log: Show scraped data that matches the user's prompt
    //console.log("🔍 Scraped finance data found:", relevantArticles);

    // Construct the final prompt being sent to OpenAI
    //const finalPrompt = `${prompt}\n\n${extraInfo}`;

    // ✅ Debug Log: Show final prompt sent to OpenAI
    //console.log("📨 Final prompt being sent to OpenAI:", finalPrompt);

    // Initialize OpenAI
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY, // Set this in Netlify's Environment Variables
    });
    const openai = new OpenAIApi(configuration);

    const messages = [
      {
        role: "system",
        content:
          `
          Bloo, you are a highly specialized AI academic assistant designed to help students with their coursework and study needs. 
          Your primary responsibility is to provide clear, accurate, and structured answers using Markdown formatting. 
          When responding, always use headings, bullet points, and numbered lists to organize information, ensuring that each answer is easy to read and understand. 
          If article links or references are available, you must include them in your response. 
          Additionally, before offering any advice or information, ask follow-up questions to clarify the user's specific situation, avoiding generic or potentially irrelevant options. 
          Remember: your responses must be delivered exclusively in Markdown format for all user interactions.
          `
      },
      ...conversation
    ];

    console.log("Conversation messages:", messages);

    // Call OpenAI's Chat Completion API
    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini-2024-07-18",
      messages: messages,
      //max_tokens: 300, // Increased token limit for longer answers
      temperature: 0.7,
    });

    if (!completion.data.choices) {
      console.error("No choices found in completion response", completion.data);
    }

    const aiResponse = completion.data.choices[0].message.content;

    // ✅ Debug Log: Show OpenAI's raw response
    console.log("🤖 Raw AI response:", aiResponse);

    return {
      statusCode: 200,
      body: JSON.stringify({ response: aiResponse }),
    };
  } catch (error) {
    console.error("❌ Error in Netlify Function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process the request" }),
    };
  }
};
