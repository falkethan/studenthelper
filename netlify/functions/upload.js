// netlify/functions/upload.js
import Busboy from 'busboy';
import fs from 'fs';
import path from 'path';
import { ingestFile } from './ingest_file_node.js';

export async function handler(event, context) {
  return new Promise((resolve, reject) => {
    // Set a file size limit (e.g., 50 MB)
    const busboy = new Busboy({ 
      headers: event.headers,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
      }
    });
    let fileBuffer = Buffer.alloc(0);
    let fileName = '';

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      fileName = filename;
      file.on('data', (data) => {
        fileBuffer = Buffer.concat([fileBuffer, data]);
      });
    });

    busboy.on('finish', async () => {
      try {
        const tempFilePath = path.join('/tmp', fileName);
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

    busboy.on('error', (err) => {
      console.error("Busboy error:", err);
      reject({
        statusCode: 413, // Payload Too Large
        body: JSON.stringify({ error: "File size exceeds limit." }),
      });
    });

    // Busboy requires the body to be a Buffer when using Netlify functions.
    busboy.end(Buffer.from(event.body, 'base64'));
  });
}
