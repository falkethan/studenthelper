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
    const { prompt } = JSON.parse(event.body);

    // Find relevant scraped finance data (simple search)
    let relevantArticles = financeData
      .filter(article => article.title.toLowerCase().includes(prompt.toLowerCase()))
      .slice(0, 3); // Return top 3 relevant articles

    let extraInfo = relevantArticles.length
      ? `Here are some articles you might find useful:\n${relevantArticles
          .map(article => `- [${article.title}](${article.url})`)
          .join("\n")}`
      : "";

    // ✅ Debug Log: Show scraped data that matches the user's prompt
    console.log("🔍 Scraped finance data found:", relevantArticles);

    // Construct the final prompt being sent to OpenAI
    const finalPrompt = `${prompt}\n\n${extraInfo}`;

    // ✅ Debug Log: Show final prompt sent to OpenAI
    console.log("📨 Final prompt being sent to OpenAI:", finalPrompt);

    // Initialize OpenAI
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY, // Set this in Netlify's Environment Variables
    });
    const openai = new OpenAIApi(configuration);

    // Call OpenAI's Chat Completion API
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { 
          role: "system", 
          content: "You are a highly knowledgeable personal finance expert specializing in all areas of money management. Your role is to help users with budgeting, saving, debt management, investing, retirement planning, tax strategies, and financial goal setting. You provide clear, step-by-step advice with practical examples. Always include a disclaimer at the end: 'I am not a licensed financial advisor, please consult a professional for personal advice.' Tailor your responses based on the user's context, and make sure your explanations are easy to understand. Provide your answers in a clear, structured format using Markdown. Use bullet points, numbered lists, and headings when appropriate to organize the information. If article links are available, **you must** include them in your response."
        },
        { role: "user", content: finalPrompt } // Inject scraped data into the prompt
      ],
      max_tokens: 300, // Increased token limit for longer answers
      temperature: 0.7,
    });

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
