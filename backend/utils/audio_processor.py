
import yt_dlp
from pydub import AudioSegment
import os

try:
    # pyrefly: ignore [missing-import]
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception:
    pass

DOWNLOAD_DIR = 'downloades'
os.makedirs(DOWNLOAD_DIR,exist_ok = True)

def download_youtube_audio(url :str) ->str:
    output_path = os.path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_path,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "192",
            }
        ],
        "extractor_args": {
            "youtube": {
                "player_client": ["android_vr", "android", "ios", "mweb"]
            }
        },
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        },
        "nocheckcertificate": True,
        "geo_bypass": True,
        "quiet": True,
    }
    
    cookie_data = os.environ.get("YOUTUBE_COOKIES")
    if cookie_data:
        cookie_path = os.path.join(DOWNLOAD_DIR, "cookies.txt")
        with open(cookie_path, "w", encoding="utf-8") as f:
            f.write(cookie_data)
        ydl_opts["cookiefile"] = cookie_path

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info).replace(".webm", ".wav").replace(".m4a", ".wav")
    return filename



def convert_to_wav(input_path: str) -> str:
    """Convert any audio or video file (.mp4, .mov, .avi, .mkv, .webm, .m4a, .mp3) to 16kHz mono WAV format."""
    input_path = os.path.abspath(input_path)
    output_path = os.path.splitext(input_path)[0] + "_converted.wav"
    
    try:
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_channels(1).set_frame_rate(16000)
        audio.export(output_path, format="wav")
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return output_path
    except Exception as e:
        print(f"Pydub conversion failed: {e}. Trying direct FFmpeg CLI fallback...")

    try:
        import subprocess
        cmd = [
            "ffmpeg", "-y", "-i", input_path,
            "-ac", "1", "-ar", "16000", "-vn",
            output_path
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            return output_path
    except Exception as ffmpeg_err:
        print(f"FFmpeg CLI conversion failed: {ffmpeg_err}")

    raise RuntimeError(f"Could not convert video/audio file '{input_path}' to WAV format")



def chunk_audio(wav_path : str , chunk_minutes : int = 10) -> list:
    audio = AudioSegment.from_wav(wav_path)
    chunk_ms = chunk_minutes * 60 * 1000

    chunks = []

    for i, start in enumerate(range(0,len(audio),chunk_ms)):
        chunk = audio[start : start + chunk_ms]
        chunk_path = f"{wav_path}_chunk_{i}.wav"
        chunk.export(chunk_path , format = "wav")

        chunks.append(chunk_path)

    return chunks

def process_input(source: str) -> list:
    if source.startswith("http://") or source.startswith("https://"):
        print("Detected YouTube URL. Downloading audio...")
        wav_path = download_youtube_audio(source)
    else:
        print("Detected local file. Converting to WAV...")
        wav_path = convert_to_wav(source)

    print("Chunking audio...")
    chunks = chunk_audio(wav_path)
    print(f"Audio ready — {len(chunks)} chunk(s) created.")
    return chunks