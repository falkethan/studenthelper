// netlify/functions/ingest_file_node.js
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import pptx2jsonFn from "pptx2json";
import { Configuration, OpenAIApi } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const DEFAULT_NAMESPACE = process.env.PINECONE_NAMESPACE || "default";

// Initialize OpenAI client
const openai = new OpenAIApi(new Configuration({ apiKey: OPENAI_API_KEY }));
// Initialize Pinecone client and get the index
const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const index = pc.Index(PINECONE_INDEX_NAME);

// Function to determine namespace from file path
function determineNamespace(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath)).toLowerCase();
  if (baseName.includes("edec") || baseName.includes("ece")) {
    return "ECE1600";
  } else if (baseName.includes("fin 3000")) {
    return "FIN3000";
  } else if (baseName.includes("fin3270")) {
    return "FIN3270";
  }
  return DEFAULT_NAMESPACE;
}

// Extraction functions for different file types:
async function extractTextFromPDF(filePath) {
  console.log(`Extracting text from PDF: ${filePath}`);
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

async function extractTextFromDOCX(filePath) {
  console.log(`Extracting text from DOCX: ${filePath}`);
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractTextFromPPTX(filePath) {
  console.log(`Extracting text from PPTX using pptx2json: ${filePath}`);
  try {
    const result = await pptx2jsonFn(filePath);
    let text = "";
    if (result && Array.isArray(result.slides)) {
      result.slides.forEach(slide => {
        if (slide.text) {
          text += slide.text + "\n";
        }
      });
    } else if (result && result.text) {
      text = result.text;
    }
    return text;
  } catch (err) {
    console.error("Error extracting PPTX text:", err);
    return "";
  }
}

// Simple chunking function – adjust as needed
function chunkText(fullText) {
  const chunks = fullText
    .split("\n\n")
    .map(chunk => chunk.trim())
    .filter(chunk => chunk);
  console.log(`Chunked text into ${chunks.length} chunks`);
  return chunks;
}

// Function to generate embeddings and prepare vectors for upsert
async function generateVectors(chunks) {
  const vectors = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      console.log(`Generating embedding for chunk ${i} (length: ${chunks[i].length})`);
      const response = await openai.createEmbedding({
        model: "text-embedding-ada-002",
        input: chunks[i],
      });
      const embedding = response.data.data[0].embedding;
      vectors.push({
        id: `chunk-${i}`,
        values: embedding,
        metadata: { text: chunks[i] },
      });
    } catch (error) {
      console.error(`Error processing chunk ${i}:`, error);
    }
  }
  console.log(`Generated ${vectors.length} vectors`);
  return vectors;
}

// Function to upsert vectors into Pinecone
async function upsertVectors(vectors, namespace) {
  if (vectors.length > 0) {
    const response = await index.upsert(vectors, { namespace });
    console.log("Upserted vectors response:", response);
  } else {
    console.log("No vectors to upsert.");
  }
}

// Main function to ingest file
async function ingestFile(filePath) {
  console.log("Ingesting file:", filePath);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found at path: ${filePath}`);
  }
  
  const namespace = determineNamespace(filePath);
  console.log("Determined namespace:", namespace);
  
  const ext = path.extname(filePath).toLowerCase();
  let fullText = "";
  
  if (ext === ".pdf") {
    fullText = await extractTextFromPDF(filePath);
    console.log("Extracted text length:", fullText.length);
    console.log("Extracted text preview:", fullText.slice(0, 200));
  } else if (ext === ".docx") {
    fullText = await extractTextFromDOCX(filePath);
    console.log("Extracted text length:", fullText.length);
  } else if (ext === ".pptx") {
    console.error("PPTX ingestion not supported yet.");
    return;
  } else {
    throw new Error("Unsupported file type: " + ext);
  }
  
  const chunks = chunkText(fullText);
  const vectors = await generateVectors(chunks);
  await upsertVectors(vectors, namespace);
}

// Execute the ingestion if a file path is provided as a command-line argument
if (process.argv.length > 2) {
  const filePath = process.argv[2];
  console.log("Received file path from arguments:", filePath);
  ingestFile(filePath)
    .then(() => console.log("File ingestion complete."))
    .catch((err) => console.error("Error during ingestion:", err));
}

export { ingestFile };
