// pinecone.js
import { initPinecone } from "./initpinecone.js";

export async function queryCoursework(queryEmbedding, topK = 5, userNamespace) {
  const index = await initPinecone();
  // Bind the index to the user's namespace (if provided)
  const nsIndex = userNamespace ? index.namespace(userNamespace) : index;
  
  // Use the correct property names in the query object
  const response = await nsIndex.query({
    vector: queryEmbedding,
    topK: topK,
    includeValues: true,
    includeMetadata: true
  });
  return response.matches;
}
