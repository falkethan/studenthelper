// netlify/functions/ingest_file_node.js
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import PPTX2Json from "pptx2json"; // Note: now imported as a class
import officeParser from "officeparser"; // fallback for PPTX extraction
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

// Determine namespace from file path
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

// Extraction functions:
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
  console.log(`Extracting text from PPTX using PPTX2Json: ${filePath}`);
  let text = "";
  // Try using PPTX2Json first
  try {
    const pptxConverter = new PPTX2Json();
    const result = await pptxConverter.convert(filePath);
    if (result && Array.isArray(result.slides)) {
      result.slides.forEach(slide => {
        if (slide.text) {
          text += slide.text + "\n";
        }
      });
    } else if (result && result.text) {
      text = result.text;
    }
  } catch (err) {
    console.error("Error using pptx2json:", err);
  }

  // If no text was extracted, try falling back to officeParser
  if (text.trim().length === 0) {
    console.warn("pptx2json returned empty text. Falling back to officeParser.");
    try {
      const officeResult = await new Promise((resolve, reject) => {
        officeParser.parseOffice(filePath, (err, data) => {
          if (err) {
            // If error is a short string, assume it's valid extracted text
            if (typeof err === "string" && err.trim().length < 300) {
              return resolve({ text: err });
            }
            return reject(err);
          }
          resolve(data);
        });
      });
      if (officeResult && officeResult.text) {
        text = officeResult.text;
      }
    } catch (err) {
      console.error("Error using officeParser fallback:", err);
    }
  }
  console.log("Extracted PPTX text length:", text.length);
  console.log("Extracted PPTX text preview:", text.slice(0, 200));
  return text;
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
async function generateVectors(chunks, uniquePrefix) {
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
        id: `${uniquePrefix}-chunk-${i}`,
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
    console.log("Extracted PDF text length:", fullText.length);
    console.log("Extracted PDF text preview:", fullText.slice(0, 200));
  } else if (ext === ".docx") {
    fullText = await extractTextFromDOCX(filePath);
    console.log("Extracted DOCX text length:", fullText.length);
  } else if (ext === ".pptx") {
    fullText = await extractTextFromPPTX(filePath);
  } else {
    throw new Error("Unsupported file type: " + ext);
  }
  
  const chunks = chunkText(fullText);
  // Create a unique prefix using the file name and current timestamp
  const uniquePrefix = `${path.basename(filePath, path.extname(filePath))}-${Date.now()}`;
  const vectors = await generateVectors(chunks, uniquePrefix);
  await upsertVectors(vectors, namespace);
}

// Execute ingestion if a file path is provided as a command-line argument
if (process.argv.length > 2) {
  const filePath = process.argv[2];
  console.log("Received file path from arguments:", filePath);
  ingestFile(filePath)
    .then(() => console.log("File ingestion complete."))
    .catch((err) => console.error("Error during ingestion:", err));
}

export { ingestFile };
