import officeParser from 'officeparser';
import path from 'path';
import { fileURLToPath } from "url";

// Determine __dirname in an ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build the correct file path
const filePath = path.join(__dirname, "test", "data", "Stevenson_14e_Chap002_PPT.pptx");
console.log(`Attempting to extract text from: ${filePath}`);

officeParser.parseOffice(filePath, (err, data) => {
  if (err) {
    console.error("Error extracting text:", err);
  } else {
    console.log("Extracted text:", data);
  }
});
