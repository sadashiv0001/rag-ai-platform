import logging
import io
import csv
from typing import Optional
import PyPDF2
import pandas as pd

logger = logging.getLogger(__name__)

def extract_text_from_pdf(file_content: bytes) -> str:
    """Extract text from PDF file."""
    try:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
        text = ""
        for page in pdf_reader.pages:
            page_text = page.extract_text() or ""
            text += page_text + "\n"
        return text.strip()
    except Exception as exc:
        logger.exception("Failed to extract text from PDF: %s", exc)
        return ""

def extract_text_from_csv(file_content: bytes) -> str:
    """Extract text from CSV file."""
    try:
        # Prefer built-in csv.Sniffer for delimiter detection (more stable than pandas internals)
        decoded = None
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                decoded = file_content.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if decoded is None:
            decoded = file_content.decode("utf-8", errors="ignore")

        sample = decoded[:4096]
        try:
            delimiter = csv.Sniffer().sniff(sample).delimiter
        except Exception:
            # Reasonable default if sniffing fails
            delimiter = ","

        df = pd.read_csv(io.StringIO(decoded), delimiter=delimiter)
        if df.empty:
            logger.warning("CSV file is empty")
            return ""
        text = df.to_string(index=False)
        return text
    except pd.errors.EmptyDataError:
        logger.warning("CSV file contains no data")
        return ""
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

def extract_text_from_excel(file_content: bytes) -> str:
    """Extract text from Excel file."""
    try:
        df = pd.read_excel(io.BytesIO(file_content))
        text = df.to_string(index=False)
        return text
    except Exception as exc:
        logger.exception("Failed to extract text from Excel: %s", exc)
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
    elif ext == 'txt':
        return file_content.decode('utf-8', errors='ignore')
    else:
        logger.warning("Unsupported file type: %s. Supported: pdf, xlsx, xls, csv, plt, txt", ext)
        return None
