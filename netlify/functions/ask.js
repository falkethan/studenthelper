// netlify/functions/ask.js
import fs from "fs";
import path from "path";
import { Configuration, OpenAIApi } from "openai";
import { queryCoursework } from "./pinecone.js";

// Load scraped finance data (if available)
const financeDataPath = path.join(process.cwd(), "netlify/functions/scraped_finance_data.json");
let financeData = [];
if (fs.existsSync(financeDataPath)) {
  financeData = JSON.parse(fs.readFileSync(financeDataPath, "utf-8"));
} else {
  console.error("⚠️ scraped finance data not found!");
}

export async function handler(event, context) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }
    
    // Expect the client to send the conversation and the userNamespace.
    const { conversation, userNamespace } = JSON.parse(event.body);
    
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);
    
    // Get the user's latest query.
    const userQuery = conversation[conversation.length - 1].content;
    
    // Use the provided userNamespace or fallback to a default.
    // (Ensure that the client sends the proper namespace string derived from the user profile.)
    const currentNamespace = userNamespace || (process.env.PINECONE_NAMESPACE || "default");
    console.log("Using course namespace:", currentNamespace);
    
    // Get the embedding for the user's query.
    const embeddingResponse = await openai.createEmbedding({
      model: "text-embedding-ada-002",
      input: userQuery,
    });
    const queryEmbedding = embeddingResponse.data.data[0].embedding;
    
    // Query Pinecone using the determined namespace.
    const pineconeMatches = await queryCoursework(queryEmbedding, 5, currentNamespace);
    console.log("🔍 Pinecone Query Results:", pineconeMatches);
    
   // Custom logic: Check if any match's metadata filename appears in the user's query.
let customMessage = "";
if (pineconeMatches.length > 0) {
  const foundMatch = pineconeMatches.find(match => {
    if (!match.metadata.filename) return false;
    // Remove extension from the filename for a more flexible match
    const baseFilename = match.metadata.filename.toLowerCase().replace(/\.[^/.]+$/, "");
    return userQuery.toLowerCase().includes(baseFilename);
  });
  if (foundMatch) {
    customMessage = `I found your document "${foundMatch.metadata.filename}". Here is a quick summary: ${foundMatch.metadata.text.slice(0, 300)}...\nCan I help you with anything else?`;
  }
}

    
const courseworkContext = customMessage !== ""
? customMessage
: (pineconeMatches.length
    ? `\n\nRelevant coursework found:\n${pineconeMatches.map(match => `- ${match.metadata.text}`).join("\n")}`
    : "\n\n[Note: Coursework data is still loading. Please specify which course you are referring to.]");

    const messages = [
      {
        role: "system",
        content: `
          You are Bloo, a highly specialized AI academic assistant with access to course-specific content.
          When answering questions, first refer to the relevant coursework retrieved below.
          If the coursework does not answer the question, then use your general knowledge.
          ${courseworkContext}
        `,
      },
      ...conversation,
    ];
    
    console.log("System prompt:", messages[0].content);
    console.log("Conversation messages:", messages);
    
    const completion = await openai.createChatCompletion({
      model: "gpt-4o-mini-2024-07-18",
      messages: messages,
      temperature: 0.7,
    });
    
    if (!completion.data.choices) {
      console.error("No choices found in completion response", completion.data);
    }
    
    const aiResponse = completion.data.choices[0].message.content;
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
}
