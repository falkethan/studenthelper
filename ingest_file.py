# ingest_file.py
import os
import sys
from pinecone import Pinecone
from openai import OpenAI
from dotenv import load_dotenv

# File-specific libraries
from PyPDF2 import PdfReader
# You may need to install these:
# pip install python-pptx python-docx
from pptx import Presentation
from docx import Document

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME")
PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "default")

client = OpenAI(api_key=OPENAI_API_KEY)
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX_NAME)

def extract_text_from_pdf(file_path):
    reader = PdfReader(file_path)
    text = ""
    for page in reader.pages:
        t = page.extract_text()
        if t:
            text += t + "\n"
    return text

def extract_text_from_pptx(file_path):
    prs = Presentation(file_path)
    text = ""
    for slide in prs.slides:
        for shape in slide.shapes:
            if hasattr(shape, "text"):
                text += shape.text + "\n"
    return text

def extract_text_from_docx(file_path):
    doc = Document(file_path)
    text = "\n".join([para.text for para in doc.paragraphs])
    return text

def chunk_text(full_text):
    # A simple split on double newlines; refine as needed
    return [chunk.strip() for chunk in full_text.split("\n\n") if chunk.strip()]

def generate_vectors(chunks):
    vectors = []
    for i, chunk in enumerate(chunks):
        try:
            response = client.embeddings.create(
                model="text-embedding-ada-002",
                input=chunk
            )
            embedding = response.data[0].embedding  # Using attribute access
            vectors.append({
                "id": f"chunk-{i}",
                "values": embedding,
                "metadata": {"text": chunk}
            })
        except Exception as e:
            print(f"Error processing chunk {i}: {e}")
    return vectors

def upsert_vectors(vectors):
    if vectors:
        upsert_response = index.upsert(vectors=vectors, namespace=PINECONE_NAMESPACE)
        print("Upserted vectors response:", upsert_response)
    else:
        print("No vectors to upsert.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python ingest_file.py <file_path>")
        sys.exit(1)

    file_path = sys.argv[1]
    ext = os.path.splitext(file_path)[1].lower()

    if ext == ".pdf":
        full_text = extract_text_from_pdf(file_path)
    elif ext == ".pptx":
        full_text = extract_text_from_pptx(file_path)
    elif ext == ".docx":
        full_text = extract_text_from_docx(file_path)
    else:
        raise ValueError("Unsupported file type: " + ext)

    chunks = chunk_text(full_text)
    vectors = generate_vectors(chunks)
    upsert_vectors(vectors)
