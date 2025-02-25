// netlify/functions/upload.js
const Busboy = require('busboy'); // Import directly without destructuring
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

exports.handler = async (event, context) => {
  return new Promise((resolve, reject) => {
    const busboy = new Busboy({ headers: event.headers });
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

        // Call the Python ingestion script using child_process.exec.
        const command = `python ingest_file.py "${tempFilePath}"`;
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error("Error processing file:", error);
            reject({
              statusCode: 500,
              body: JSON.stringify({ error: error.message }),
            });
          } else {
            console.log("Ingestion output:", stdout);
            resolve({
              statusCode: 200,
              body: JSON.stringify({ message: "File processed and ingested successfully." }),
            });
          }
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
};
