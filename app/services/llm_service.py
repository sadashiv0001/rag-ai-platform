from openai import OpenAI
from app.config import OPENAI_API_KEY, LLM_MODEL

client = OpenAI(api_key=OPENAI_API_KEY)

def generate_answer(context, query):
    prompt = f"""
    Answer the question using the context below.
    
    Context:
    {context}

    Question:
    {query}
    """

    response = client.chat.completions.create(
        model=LLM_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )

    return response.choices[0].message.content