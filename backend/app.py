import os
import json
import uuid
import shutil
import logging
from datetime import datetime
from fastapi import FastAPI, BackgroundTasks, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse 

# Initialize FastAPI
app = FastAPI(title="AI Meeting Assistant API", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/api")
def root():
    return {"status": "ok", "message": "Flipbook AI API Backend is Live!"}

# Constants & Paths
UPLOAD_DIR = "temp_uploads"
CHROMA_DIR = "vector_db"
DB_FILE = "meetings_db.json"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(CHROMA_DIR, exist_ok=True)

# Logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("RAG_Backend")

def load_db():
    if not os.path.exists(DB_FILE):
        return {}
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading DB: {e}")
        return {}

def save_db(db):
    try:
        with open(DB_FILE, "w") as f:
            json.dump(db, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving DB: {e}")

def run_pipeline_task(meeting_id: str, source_path: str, is_youtube: bool, language: str):
    db = load_db()
    if meeting_id not in db:
        return

    db[meeting_id]["status"] = "processing"
    save_db(db)

    persist_dir = os.path.join(CHROMA_DIR, meeting_id)

    try:
        logger.info(f"Starting background RAG pipeline for meeting {meeting_id} (source: {source_path})")
        from main import run_pipeline
        # pyrefly: ignore [unexpected-keyword]
        result = run_pipeline(source_path, language=language, persist_dir=persist_dir)

        # Update database with results
        db = load_db()
        if meeting_id in db:
            db[meeting_id].update({
                "status": "completed",
                "title": result.get("title", "Untitled Meeting"),
                "transcript": result.get("transcript", ""),
                "summary": result.get("summary", ""),
                "action_items": result.get("action_items", ""),
                "key_decisions": result.get("key_decisions", ""),
                "open_questions": result.get("open_questions", ""),
                "completed_at": datetime.now().isoformat(),
            })
            save_db(db)
            logger.info(f"Successfully processed meeting {meeting_id}")
    except Exception as e:
        logger.error(f"Failed to process meeting {meeting_id}: {e}")
        logger.error(traceback_format := traceback_formatter(e))
        err_msg = str(e)
        if any(term in err_msg.lower() for term in ["sign in to confirm", "login_required", "bot", "429 client error"]):
            err_msg = "YouTube requires account authentication for this video on cloud servers. Please upload the local audio/video file directly using the 📎 attachment button, or try a public YouTube video link!"
        
        db = load_db()
        if meeting_id in db:
            db[meeting_id].update({
                "status": "failed",
                "error": err_msg,
                "completed_at": datetime.now().isoformat(),
            })
            save_db(db)
    finally:
        # Clean up local uploaded file (if it was an upload and exists)
        if not is_youtube and os.path.exists(source_path):
            try:
                os.remove(source_path)
                logger.info(f"Removed temporary upload file: {source_path}")
            except Exception as cleanup_err:
                logger.warning(f"Failed to remove temporary file {source_path}: {cleanup_err}")

def traceback_formatter(e):
    import traceback
    return "".join(traceback.format_exception(type(e), e, e.__traceback__))

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Uploads a local audio/video file to the server temporary directory."""
    try:
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        dest_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        logger.info(f"File uploaded: {file.filename} -> {dest_path}")
        return {"filename": file.filename, "filepath": dest_path}
    except Exception as e:
        logger.error(f"File upload error: {e}")
        raise HTTPException(status_code=500, detail=f"File upload failed: {str(e)}")

@app.post("/api/process")
def process_meeting(
    background_tasks: BackgroundTasks,
    source: str = Form(...),
    language: str = Form("english")
):
    """Submits a meeting for processing."""
    src_clean = source.strip()
    is_youtube = (
        src_clean.startswith("http://") or 
        src_clean.startswith("https://") or 
        src_clean.startswith("www.") or 
        (len(src_clean) == 11 and not os.path.exists(src_clean))
    )
    meeting_id = str(uuid.uuid4())
    
    db = load_db()
    db[meeting_id] = {
        "id": meeting_id,
        "title": "Processing...",
        "source": source,
        "language": language,
        "status": "queued",
        "created_at": datetime.now().isoformat(),
        "completed_at": None,
        "transcript": "",
        "summary": "",
        "action_items": "",
        "key_decisions": "",
        "open_questions": "",
        "error": None
    }
    save_db(db)
    
    background_tasks.add_task(
        run_pipeline_task,
        meeting_id=meeting_id,
        source_path=source,
        is_youtube=is_youtube,
        language=language
    )
    
    return {"meeting_id": meeting_id, "status": "queued"}

@app.get("/api/meetings")
def get_meetings():
    """Lists all meetings in the database."""
    db = load_db()
    # Return brief info (omit full transcript/summary in lists to save bandwidth)
    meetings_list = []
    for mid, item in db.items():
        meetings_list.append({
            "id": item["id"],
            "title": item["title"],
            "source": item["source"],
            "language": item["language"],
            "status": item["status"],
            "created_at": item["created_at"],
            "completed_at": item["completed_at"],
            "error": item["error"]
        })
    # Sort by created_at descending
    meetings_list.sort(key=lambda x: x["created_at"], reverse=True)
    return meetings_list

@app.get("/api/meetings/{meeting_id}")
def get_meeting(meeting_id: str):
    """Retrieves full details of a single meeting."""
    db = load_db()
    if meeting_id not in db:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return db[meeting_id]

@app.delete("/api/meetings/{meeting_id}")
def delete_meeting(meeting_id: str):
    """Deletes meeting database entry and its vector storage files."""
    db = load_db()
    if meeting_id not in db:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    del db[meeting_id]
    save_db(db)
    
    # Delete isolated Chroma directory
    persist_dir = os.path.join(CHROMA_DIR, meeting_id)
    if os.path.exists(persist_dir):
        try:
            shutil.rmtree(persist_dir)
            logger.info(f"Deleted vector database directory: {persist_dir}")
        except Exception as e:
            logger.warning(f"Failed to delete Chroma directory {persist_dir}: {e}")
            
    return {"message": "Meeting deleted successfully"}

@app.post("/api/meetings/{meeting_id}/chat")
def chat_with_meeting(meeting_id: str, payload: dict):
    """Asks a question using the RAG chain for the specified meeting."""
    db = load_db()
    if meeting_id not in db:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    meeting = db[meeting_id]
    if meeting["status"] != "completed":
        raise HTTPException(status_code=400, detail="Meeting is not yet fully processed")
        
    question = payload.get("question")
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
        
    persist_dir = os.path.join(CHROMA_DIR, meeting_id)
    try:
        from core.rag_engine import load_rag_chain, build_rag_chain, ask_question
        if os.path.exists(persist_dir):
            rag_chain = load_rag_chain(persist_dir=persist_dir)
        else:
            logger.info(f"Vector store missing for meeting {meeting_id}, auto-rebuilding from transcript...")
            rag_chain = build_rag_chain(meeting.get("transcript", ""), persist_dir=persist_dir)
            
        answer = ask_question(rag_chain, question)
        return {"answer": answer}
    except Exception as e:
        logger.error(f"Chat error for meeting {meeting_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Q&A error: {str(e)}")

@app.get("/api/meetings/{meeting_id}/export/{format}")
def export_meeting(meeting_id: str, format: str):
    """Exports the transcript and analysis to Markdown or text format."""
    db = load_db()
    if meeting_id not in db:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    meeting = db[meeting_id]
    if meeting["status"] != "completed":
        raise HTTPException(status_code=400, detail="Meeting not completed")
        
    content = f"# Meeting Title: {meeting['title']}\n"
    content += f"Date Processed: {meeting['completed_at']}\n"
    content += f"Source: {meeting['source']}\n"
    content += f"Language: {meeting['language']}\n\n"
    content += f"## Summary\n{meeting['summary']}\n\n"
    content += f"## Action Items\n{meeting['action_items']}\n\n"
    content += f"## Key Decisions\n{meeting['key_decisions']}\n\n"
    content += f"## Open Questions\n{meeting['open_questions']}\n\n"
    content += f"## Full Transcript\n{meeting['transcript']}\n"
    
    file_name = f"{meeting['title'].lower().replace(' ', '_')}_{meeting_id[:8]}"
    
    if format.lower() == "md":
        temp_export_path = f"temp_uploads/{file_name}.md"
        with open(temp_export_path, "w", encoding="utf-8") as f:
            f.write(content)
        return FileResponse(temp_export_path, media_type="text/markdown", filename=f"{file_name}.md")
        
    elif format.lower() == "txt":
        temp_export_path = f"temp_uploads/{file_name}.txt"
        with open(temp_export_path, "w", encoding="utf-8") as f:
            f.write(content)
        return FileResponse(temp_export_path, media_type="text/plain", filename=f"{file_name}.txt")
        
    else:
        raise HTTPException(status_code=400, detail="Unsupported export format. Use 'md' or 'txt'")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    logger.info(f"Starting uvicorn server on 0.0.0.0:{port}")
    uvicorn.run("app:app", host="0.0.0.0", port=port, log_level="info")
