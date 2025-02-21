// netlify/functions/ask.js
const { Configuration, OpenAIApi } = require('openai');

exports.handler = async (event, context) => {
  try {
    // Ensure it's a POST request
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // Parse the request body
    const { prompt } = JSON.parse(event.body);

    // Initialize OpenAI
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY, // Set this in Netlify's Environment Variables
    });
    const openai = new OpenAIApi(configuration);

    // Call OpenAI's Chat Completion API
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a highly knowledgeable personal finance expert specializing in all areas of money management. Your role is to help users with budgeting, saving, debt management, investing, retirement planning, tax strategies, and financial goal setting. You provide clear, step-by-step advice with practical examples. Always include a disclaimer at the end: "I am not a licensed financial advisor, please consult a professional for personal advice." Tailor your responses based on the users context, and make sure your explanations are easy to understand. Provide your answers in a clear, structured format using Markdown. Use bullet points, numbered lists, and headings when appropriate to organize the information."' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    const aiResponse = completion.data.choices[0].message.content;

    return {
      statusCode: 200,
      body: JSON.stringify({ response: aiResponse }),
    };
  } catch (error) {
    console.error("Error in Netlify Function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process the request" }),
    };
  }
};
