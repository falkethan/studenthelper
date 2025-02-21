// 1. Load environment variables from .env
require('dotenv').config();

// 2. Import the necessary packages
const express = require('express');
const cors = require('cors');
const { Configuration, OpenAIApi } = require('openai');

// 3. Log a startup message (helps confirm the file is actually running)
console.log("Starting index.js file...");

// 4. Create an Express app, enable CORS and JSON parsing
const app = express();
app.use(cors());
app.use(express.json());

// 5. Initialize OpenAI with your API key from .env
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// 6. A simple test route to confirm the server is running

    const messages = [
      {
        role: 'system',
        content: `
          You are an AI specialized in general personal finance education 
          (budgeting, saving, debt payoff). 
          Include a disclaimer that you're not a professional financial advisor. 
          Keep responses concise and friendly.
        `
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    // Call OpenAI Chat Completion endpoint
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',  // or 'gpt-4' if you have access
      messages: messages,
      max_tokens: 500,
      temperature: 0.7
    });

    // Extract the AI's response text
    const aiResponse = completion.data.choices[0].message.content;

    // Return the response to the front-end in JSON
    res.json({ response: aiResponse });
  } catch (error) {
    console.error("Error with OpenAI request:", error);
    res.status(500).json({ error: "Something went wrong with the AI request" });
  }
});

// 8. Start the server on port 3001 (or an environment port)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
