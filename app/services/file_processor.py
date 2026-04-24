import logging
import io
from typing import Optional
import PyPDF2
import pandas as pd
from openai import OpenAI
from app.config import OPENAI_API_KEY

logger = logging.getLogger(__name__)
client = OpenAI(api_key=OPENAI_API_KEY)

def extract_text_from_pdf(file_content: bytes) -> str:
    """Extract text from PDF file."""
    try:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
    except Exception as exc:
        logger.exception("Failed to extract text from PDF: %s", exc)
        return ""

def extract_text_from_csv(file_content: bytes) -> str:
    """Extract text from CSV file."""
    try:
        df = pd.read_csv(io.BytesIO(file_content))
        text = df.to_string(index=False)
        return text
    except Exception as exc:
        logger.exception("Failed to extract text from CSV: %s", exc)
        return ""

def extract_text_from_plt(file_content: bytes) -> str:
    """Extract text from PLT file (assuming text-based like GPS tracks or HPGL)."""
    try:
        return file_content.decode('utf-8', errors='ignore')
    except Exception as exc:
        logger.exception("Failed to extract text from PLT: %s", exc)
        return ""

def process_file(file_content: bytes, filename: str) -> Optional[str]:
    """Process uploaded file and extract text."""
    ext = filename.lower().split('.')[-1]
    if ext == 'pdf':
        return extract_text_from_pdf(file_content)
    elif ext in ['xlsx', 'xls']:
        return extract_text_from_excel(file_content)
    elif ext == 'csv':
        return extract_text_from_csv(file_content)
    elif ext == 'plt':
        return extract_text_from_plt(file_content)
    elif ext in ['mp3', 'wav', 'm4a', 'flac']:
        return transcribe_audio(file_content, filename)
    elif ext == 'txt':
        return file_content.decode('utf-8', errors='ignore')
    else:
        logger.warning("Unsupported file type: %s", ext)
        return None
