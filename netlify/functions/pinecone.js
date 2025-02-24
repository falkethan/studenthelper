// pinecone.js
const { Pinecone } = require('@pinecone-database/pinecone');

// Initialize the Pinecone client and target your index
async function initPinecone() {
  // Create a new Pinecone client instance using your API key
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });
  // Target your index using the index name from your environment variables
  const index = pc.index(process.env.PINECONE_INDEX_NAME);
  return index;
}

// Query the Pinecone index for relevant vectors based on the provided embedding
async function queryCoursework(queryEmbedding, topK = 5) {
  const index = await initPinecone();
  // Use a namespace if you have one defined; otherwise, use 'default'
  const namespace = process.env.PINECONE_NAMESPACE || 'default';
  const response = await index.namespace(namespace).query({
    topK: topK,
    vector: queryEmbedding,
    includeValues: false,       // Change to true if you need the raw vector values
    includeMetadata: true,      // We need metadata to extract course-specific text
  });
  return response.matches;
}

module.exports = { initPinecone, queryCoursework };
