// netlify/functions/upload.js
import Busboy from 'busboy';
import fs from 'fs';
import path from 'path';
import { ingestFile } from './ingest_file_node.js';

export async function handler(event, context) {
  return new Promise((resolve, reject) => {
    const busboy = new Busboy({ headers: event.headers });
    let fileBuffer = Buffer.alloc(0);
    let fileName = '';
    
    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      console.log("Original filename from client:", filename);
      fileName = filename.split(/[\\/]/).pop(); // This should already do the trick
      // If there’s still an unwanted prefix, remove it explicitly:
      if (fileName.startsWith("test/data/")) {
        fileName = fileName.replace("test/data/", "");
      }
      if (fileName.startsWith("./test/data/")) {
        fileName = fileName.replace("./test/data/", "");
      }
      console.log("Sanitized filename:", fileName);
      file.on('data', (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
    });
    
    
    busboy.on('finish', async () => {
      try {
        const tempFilePath = path.join('/tmp', fileName);
        console.log("Saving file to:", tempFilePath);
        fs.writeFileSync(tempFilePath, fileBuffer);
        console.log("File saved to", tempFilePath);

        // Call the ingestion function directly:
        await ingestFile(tempFilePath);
        
        resolve({
          statusCode: 200,
          body: JSON.stringify({ message: "File processed and ingested successfully." }),
        });
      } catch (error) {
        console.error("Error processing file:", error);
        reject({
          statusCode: 500,
          body: JSON.stringify({ error: error.message }),
        });
      }
    });

    // Busboy requires the body to be a Buffer when using Netlify functions.
    busboy.end(Buffer.from(event.body, 'base64'));
  });
}
