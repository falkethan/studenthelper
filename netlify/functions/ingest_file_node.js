// netlify/functions/ingest_file_node.js
import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import PPTX2Json from "pptx2json"; // imported as a class
import officeParser from "officeparser"; // fallback for PPTX extraction
import XLSX from "xlsx"; // For parsing Excel files
import Tesseract from "tesseract.js"; // For OCR on images
import { Configuration, OpenAIApi } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

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

// Determine namespace from file path if no user namespace is provided
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

async function chunkTextWithLangchain(fullText) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,    // Adjust chunk size as needed
    chunkOverlap: 100,  // Adjust overlap as needed
  });
  const chunks = await splitter.splitText(fullText);
  console.log(`Langchain chunked text into ${chunks.length} chunks`);
  return chunks;
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

async function extractTextFromExcel(filePath) {
  console.log(`Extracting text from Excel: ${filePath}`);
  const dataBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(dataBuffer, { type: "buffer" });
  let fullText = "";
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const sheetText = XLSX.utils.sheet_to_csv(worksheet);
    fullText += sheetText + "\n";
  });
  console.log("Extracted Excel text length:", fullText.length);
  console.log("Extracted Excel text preview:", fullText.slice(0, 200));
  return fullText;
}

// Extraction function for images (.jpg, .jpeg, .png, .heic, .heif)
// For HEIC/HEIF, sharp is dynamically imported and used to convert to PNG.
import { createWorker } from 'tesseract.js';

async function extractTextFromImage(filePath) {
  console.log(`Extracting text from image: ${filePath}`);
  try {
    const { data: { text } } = await Tesseract.recognize(
      filePath,
      'eng', // adjust language if needed
      { logger: m => console.log(m) }
    );
    console.log("Extracted image text length:", text.length);
    console.log("Extracted image text preview:", text.slice(0, 200));
    return text;
  } catch (err) {
    console.error("Error during OCR extraction:", err);
    throw err;
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

async function generateVectors(chunks, uniquePrefix, filePath) {
  const vectors = [];
  const filename = path.basename(filePath);
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
        metadata: { 
          text: chunks[i],
          filename: filename
        },
      });
    } catch (error) {
      console.error(`Error processing chunk ${i}:`, error);
    }
  }
  console.log(`Generated ${vectors.length} vectors`);
  return vectors;
}

async function upsertVectors(vectors, namespaceId) {
  if (vectors.length > 0) {
    const nsRef = index.namespace(namespaceId);
    console.log("Using namespace reference:", namespaceId);
    const batchSize = 200;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      const response = await nsRef.upsert(batch);
      console.log(`Batch upsert response for records ${i} to ${i + batch.length}:`, response);
    }
  } else {
    console.log("No vectors to upsert.");
  }
}

async function ingestFile(inputPath, userNamespace) {
  console.log("Ingesting input:", inputPath);
  let fullText = "";
  // For file paths, ensure the file exists
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found at path: ${inputPath}`);
  }
  const ext = path.extname(inputPath).toLowerCase();
  if (ext === ".pdf") {
    fullText = await extractTextFromPDF(inputPath);
    console.log("Extracted PDF text length:", fullText.length);
    console.log("Extracted PDF text preview:", fullText.slice(0, 200));
  } else if (ext === ".docx") {
    fullText = await extractTextFromDOCX(inputPath);
    console.log("Extracted DOCX text length:", fullText.length);
  } else if (ext === ".pptx") {
    fullText = await extractTextFromPPTX(inputPath);
  } else if (ext === ".xlsx" || ext === ".xls") {
    fullText = await extractTextFromExcel(inputPath);
  } else if ([".jpg", ".jpeg", ".png", ".heic", ".heif"].includes(ext)) {
    if (ext === ".heic" || ext === ".heif") {
      // Dynamically import sharp for HEIC/HEIF conversion
      const { default: sharp } = await import("sharp");
      const tempPath = inputPath + ".png";
      console.log(`Converting HEIC/HEIF image ${inputPath} to PNG format.`);
      await sharp(inputPath).png().toFile(tempPath);
      fullText = await extractTextFromImage(tempPath);
      fs.unlinkSync(tempPath);
    } else {
      fullText = await extractTextFromImage(inputPath);
    }
  } else {
    throw new Error("Unsupported file type: " + ext);
  }

  const namespace = userNamespace || determineNamespace(inputPath);
  console.log("Using namespace:", namespace);
  
  let chunks = [];
  try {
    chunks = await chunkTextWithLangchain(fullText);
  } catch (err) {
    console.error("Error using Langchain chunking, falling back to simple chunking", err);
    chunks = chunkText(fullText);
  }
  const uniquePrefix = `${path.basename(inputPath, path.extname(inputPath))}-${Date.now()}`;
  const vectors = await generateVectors(chunks, uniquePrefix, inputPath);
  await upsertVectors(vectors, namespace);
}

export { ingestFile };

export async function handler(event, context) {
  try {
    // Extract the logged-in user's unique identifier.
    // This example assumes Netlify Identity is configured and provides userContext.
    const userNamespace = event.userContext && event.userContext.user && event.userContext.user.sub
      ? event.userContext.user.sub
      : "default"; // fallback namespace if no user is logged in

    const { inputPath } = JSON.parse(event.body);
    console.log("Using namespace (auto-assigned):", userNamespace);
    await ingestFile(inputPath, userNamespace);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error("Error in handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}
