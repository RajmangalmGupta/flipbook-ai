import re
from dotenv import load_dotenv
from utils.audio_processor import process_input
from core.transcriber import transcribe_all
from core.summarizer import summarize, generate_title
from core.extractor import extract_action_items, extract_key_decisions, extract_questions
from core.rag_engine import build_rag_chain, ask_question

load_dotenv()

def extract_youtube_id(url: str) -> str:
    match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
    return match.group(1) if match else None

def get_youtube_transcript(url: str) -> str:
    # pyrefly: ignore [missing-import]
    from youtube_transcript_api import YouTubeTranscriptApi
    video_id = extract_youtube_id(url)
    if not video_id:
        raise ValueError("Invalid YouTube URL")
    
    api = YouTubeTranscriptApi()
    try:
        fetched = api.fetch(video_id)
        text = " ".join([snippet.text for snippet in fetched.snippets])
        if text and len(text.strip()) > 50:
            print("Successfully retrieved video transcript via YouTube Transcript API (Instant)!")
            return text
    except Exception as e:
        print(f"Direct API fetch failed: {e}. Trying list transcripts fallback...")
        try:
            transcript_list = YouTubeTranscriptApi.list(video_id)
            transcript = transcript_list.find_transcript(['en', 'en-US', 'en-IN', 'hi'])
            fetched = transcript.fetch()
            text = " ".join([item.text for item in fetched])
            if text and len(text.strip()) > 50:
                print("Successfully retrieved transcript via fallback search!")
                return text
        except Exception as inner_e:
            print(f"Transcript API fallback failed: {inner_e}")
            raise Exception("No transcript available via API")
            
    raise Exception("Empty transcript returned")

def run_pipeline(source :str, language :str = "english", persist_dir: str = None) -> dict:
    print("starting AI Video Assistant")

    transcript = ""
    is_youtube = source.startswith("http://") or source.startswith("https://")
    
    if is_youtube:
        try:
            print(f"Attempting instant transcript retrieval for {source}...")
            transcript = get_youtube_transcript(source)
        except Exception as err:
            print(f"YouTube Transcript API unavailable ({err}). Falling back to audio download + Whisper...")
            chunks = process_input(source)
            transcript = transcribe_all(chunks, language)
    else:
        chunks = process_input(source)
        transcript = transcribe_all(chunks, language)

    print(f"raw transcription (first 300 characters ): {transcript[:300]}")

    title = generate_title(transcript)

    summary = summarize(transcript)

    action_item = extract_action_items(transcript)

    decisions = extract_key_decisions(transcript)
    questions = extract_questions(transcript)

    rag_chain = build_rag_chain(transcript, persist_dir=persist_dir)

    return {
        "title": title,
        "transcript": transcript,
        "summary": summary,
        "action_items": action_item,
        "key_decisions": decisions,
        "open_questions": questions,
        "rag_chain": rag_chain,
    }

if __name__ == "__main__":
    # CLI entry point
    source = input("Enter YouTube URL or local file path: ").strip()
    language = input("Language (english/hinglish): ").strip() or "english"
    result = run_pipeline(source, language)

    print("\n" + "=" * 60)
    print(f"📌 Title: {result['title']}")
    print(f"\n📋 Summary:\n{result['summary']}")
    print(f"\n✅ Action Items:\n{result['action_items']}")
    print(f"\n🔑 Key Decisions:\n{result['key_decisions']}")
    print(f"\n❓ Open Questions:\n{result['open_questions']}")
    print("=" * 60)

    # Phase 2 — Chat with your meeting via RAG
    print("\n💬 Chat with your meeting (type 'exit' to quit)\n")
    rag_chain = result["rag_chain"]
    while True:
        question = input("You: ").strip()
        if question.lower() in ["exit", "quit", "q"]:
            print("👋 Goodbye!")
            break
        if not question:
            continue
        answer = ask_question(rag_chain, question)
        print(f"\n🤖 Assistant: {answer}\n")