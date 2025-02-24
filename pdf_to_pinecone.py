# pdf_to_pinecone.py
import os
from pinecone import Pinecone  # Import the Pinecone class from the new SDK
from openai import OpenAI     # Use the new OpenAI client
from PyPDF2 import PdfReader
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")
PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "default")

# Initialize the OpenAI client using the new method
client = OpenAI(api_key=OPENAI_API_KEY)

# Initialize Pinecone using the new method. Adding this comment to have something to push. Doing this again to have something to push.
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX_NAME)

# Extract text from the PDF
pdf_file = r"C:\Users\ethan\OneDrive\Desktop\studenthelper\syallabus-pdf.pdf"  # Replace with your PDF filename
reader = PdfReader(pdf_file)
full_text = ""
for page in reader.pages:
    text = page.extract_text()
    if text:
        full_text += text + "\n"

# Chunk the text (a simple split based on double newlines; adjust as needed)
chunks = [chunk.strip() for chunk in full_text.split("\n\n") if chunk.strip()]

# Generate embeddings and prepare vectors for upsert
vectors = []
for i, chunk in enumerate(chunks):
    try:
        # Get embedding for the chunk using the new OpenAI client method
        response = client.embeddings.create(
            model="text-embedding-ada-002",
            input=chunk
        )
        # Use attribute access instead of subscripting the response
        embedding = response.data[0].embedding
        vectors.append({
            "id": f"pdf-chunk-{i}",
            "values": embedding,
            "metadata": {"text": chunk}
        })
    except Exception as e:
        print(f"Error processing chunk {i}: {e}")

# Upsert the vectors into Pinecone under the specified namespace
if vectors:
    # Pass the namespace as an argument directly to upsert()
    upsert_response = index.upsert(vectors=vectors, namespace=PINECONE_NAMESPACE)
    print("Upserted vectors response:", upsert_response)
else:
    print("No vectors to upsert.")
