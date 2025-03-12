//gpt-4o-mini-2024-07-18
// netlify/functions/ask.js
import fs from "fs";
import path from "path";
import { Configuration, OpenAIApi } from "openai";
import { queryCoursework } from "./pinecone.js";

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
    
    // Additional retrieval step: Generate a detailed context summary from all retrieved coursework.
    let detailedContext = "";
    if (pineconeMatches.length > 0) {
      // Combine all retrieved text from matches.
      const combinedText = pineconeMatches.map(match => match.metadata.text).join("\n---\n");
      
      // Use OpenAI to generate a concise summary of the combined text.
      const summarizationPrompt = `Summarize the following coursework content into a concise and coherent summary:\n\n${combinedText}`;
      const summaryCompletion = await openai.createChatCompletion({
        model: "gpt-4o-mini-2024-07-18",
        messages: [{ role: "system", content: summarizationPrompt }],
        temperature: 0.5,
      });
      detailedContext = summaryCompletion.data.choices[0].message.content;
      console.log("Detailed context summary:", detailedContext);
    }
    
    // Custom logic: Check if any match's metadata filename appears in the user's query.
    let customMessage = "";
    if (pineconeMatches.length > 0) {
      const foundMatch = pineconeMatches.find(match => {
        if (!match.metadata.filename) return false;
        // Remove extension from the filename for a more flexible match.
        const baseFilename = match.metadata.filename.toLowerCase().replace(/\.[^/.]+$/, "");
        return userQuery.toLowerCase().includes(baseFilename);
      });
      if (foundMatch) {
        customMessage = `I found your document "${foundMatch.metadata.filename}". Here is a quick summary: ${foundMatch.metadata.text.slice(0, 300)}...\nCan I help you with anything else?`;
      }
    }
    
    // Build the coursework context using the custom message, detailed summary, or a fallback.
    const courseworkContext = customMessage !== ""
      ? customMessage
      : (detailedContext !== ""
          ? `\n\nDetailed retrieved coursework summary:\n${detailedContext}`
          : (pineconeMatches.length
              ? `\n\nRelevant coursework found:\n${pineconeMatches.map(match => `- ${match.metadata.text}`).join("\n")}`
              : "\n\n[Note: Coursework data is still loading. Please specify which course you are referring to.]"));
    
 // --- NEW WEB SEARCH INTEGRATION ---
// Decide whether to trigger a web search based on the user's query.
let webContext = "";
let shouldSearchWeb = false;
const lowerQuery = userQuery.toLowerCase();

// Check if query contains a URL
const urlRegex = /(https?:\/\/[^\s]+)/;
const urlMatch = userQuery.match(urlRegex);
if (urlMatch) {
  shouldSearchWeb = true;
} else {
  // Check for keywords that indicate a need for external info.
  const webSearchKeywords = [
    "latest", "news", "current", "update",
    "find sources", "support", "evidence", "search the web"
  ];
  if (webSearchKeywords.some(keyword => lowerQuery.includes(keyword))) {
    shouldSearchWeb = true;
  }
}

if (shouldSearchWeb) {
  console.log("Web search triggered for query:", userQuery);
  
  // If a URL is present, extract it and use a specialized prompt.
  let webSearchPrompt = "";
  if (urlMatch) {
    const extractedUrl = urlMatch[0];
    webSearchPrompt = `You are a web search tool that retrieves and summarizes content from public websites.
Fetch and summarize the content of the following URL:
${extractedUrl}`;
  } else {
    // Otherwise, build a generic prompt for external sources.
    webSearchPrompt = `Using available web search capabilities, find and summarize relevant external sources for the following query: "${userQuery}"`;
  }
  
  // Simulate a web search call (in production, use the dedicated tool interface).
  const webSearchCompletion = await openai.createChatCompletion({
    model: "gpt-4o-mini-2024-07-18",
    messages: [{ role: "system", content: webSearchPrompt }],
    temperature: 0.5,
  });
  webContext = webSearchCompletion.data.choices[0].message.content;
  console.log("Web search summary:", webContext);
}

    // Combine coursework context with web search context (if available).
const finalContext = courseworkContext + (webContext ? `\n\nExternal sources summary:\n${webContext}` : "");

    
    // Build final messages for the chat completion.
    const messages = [
      {
        role: "system",
        content: `
          You are Bloo, a highly specialized AI academic assistant with access to course-specific content.
          When answering questions, first refer to the relevant coursework retrieved below.
          If the coursework does not fully answer the question, then use your general knowledge.
          ${finalContext}
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
