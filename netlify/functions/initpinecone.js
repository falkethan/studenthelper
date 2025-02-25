import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
dotenv.config();

export async function initPinecone() {
  // If you need to specify a custom controller host, uncomment the controllerHostUrl line.
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
    // controllerHostUrl: 'https://api.pinecone.io', // Uncomment if needed.
    // Do not include an "environment" parameter.
  });
  
  // Get the index instance using the index name from your env.
  const index = pc.Index(process.env.PINECONE_INDEX_NAME);
  return index;
}
