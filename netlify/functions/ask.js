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
        { role: 'system', content: 'You are a personal finance AI advisor. Provide helpful, tailored advice and include a disclaimer: "I am not a licensed financial advisor."' },
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
