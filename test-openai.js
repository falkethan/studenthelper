require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Add this to enable CORS
const { Configuration, OpenAIApi } = require('openai');

const app = express();
app.use(cors());           // Enable CORS for all origins
app.use(express.json());   // Parse JSON bodies

// Test root route
app.get('/', (req, res) => {
  res.send("Hello from test-openai root!");
});

// POST /api/ask route that calls the OpenAI API
app.post('/api/ask', async (req, res) => {
  try {
    console.log("POST /api/ask was called!");
    console.log("Request body:", req.body);

    const userPrompt = req.body.prompt || "";
    
    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);

    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `
            You are a helpful personal finance AI advisor.
            Provide general advice on budgeting, saving, and debt management.
            Include a disclaimer: "I am not a licensed financial advisor."
          `
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    const aiResponse = completion.data.choices[0].message.content;
    res.json({ response: aiResponse });
    
  } catch (error) {
    console.error("Error calling OpenAI:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to process the request" });
  }
});

// Start the server on port 3001
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test server listening on port ${PORT}`);
});
