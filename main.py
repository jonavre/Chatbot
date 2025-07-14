from fastapi import FastAPI, UploadFile, File, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import openai
import fitz
import json
import logging
import os
from dotenv import load_dotenv
import openai

app = FastAPI()

logging.basicConfig(level=logging.INFO)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pdf_context = {"text": ""}

load_dotenv() 
openai.api_key = os.getenv("OPENAI_API_KEY")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    try:
        content = await file.read()
        with fitz.open(stream=content, filetype="pdf") as doc:
            text = ""
            for page in doc:
                text += page.get_text() or ""

        pdf_context["text"] = text.strip()
        logging.info(f"PDF loaded with {len(pdf_context['text'])} characters")
        return {
            "message": "PDF loaded successfully",
            "characters": len(pdf_context["text"])
        }
    except Exception as e:
        logging.error(f"Error loading PDF: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.get("/chat_stream")
async def chat_stream(request: Request, message: str, conversation_id: str = ""):
    if not pdf_context["text"]:
        return JSONResponse(
            status_code=400,
            content={"error": "No PDF context loaded"}
        )

    async def event_generator():
        system_prompt = (
            "You are an expert assistant. Only answer questions based on the following PDF content:\n\n"
            + pdf_context["text"][:3000]
        )

        logging.info(f"Received question: {message}")

        try:
            response = await openai.ChatCompletion.acreate(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message}
                ],
                stream=True,
            )

            async for chunk in response:
                if await request.is_disconnected():
                    logging.warning("Client disconnected, stopping stream")
                    break
                if "choices" in chunk:
                    delta = chunk["choices"][0]["delta"]
                    if "content" in delta:
                        yield f"data: {json.dumps({'type': 'content', 'content': delta['content']})}\n\n"

            yield "data: {\"type\": \"done\"}\n\n"

        except Exception as e:
            logging.error(f"Error in chat_stream: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
