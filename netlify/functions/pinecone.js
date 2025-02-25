// pinecone.js
import { initPinecone } from "./initpinecone.js";

export async function queryCoursework(queryEmbedding, topK = 5) {
  const index = await initPinecone();
  const response = await index.query({
    vector: queryEmbedding,
    topK: topK,
    includeMetadata: true,
    includeValues: false,
  });
  return response.matches;
}
