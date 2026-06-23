import os
import sys
import json
import base64
import argparse
import io
import subprocess
import time
import urllib.request
import urllib.parse
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="GPT-SoVITS Local Adapter Server")

# Configs
GPTSOVITS_REAL_PORT = 9881  # Port of the actual GPT-SoVITS backend api.py
gptsovits_process = None
MODEL_DIR = None

class Message(BaseModel):
    role: str
    content: str

class AudioConfig(BaseModel):
    format: str = "mp3"
    voice: Optional[str] = None  # Base64 reference audio for cloning

class ChatCompletionsRequest(BaseModel):
    model: str
    messages: List[Message]
    audio: AudioConfig

def wait_for_backend(timeout=120):
    """Polls the backend port until it is responsive or timeout is reached."""
    start_time = time.time()
    print(f"Waiting for GPT-SoVITS backend on port {GPTSOVITS_REAL_PORT} to become responsive...")
    while time.time() - start_time < timeout:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{GPTSOVITS_REAL_PORT}/")
            with urllib.request.urlopen(req, timeout=1) as response:
                pass
            print(f"GPT-SoVITS backend on port {GPTSOVITS_REAL_PORT} is ready!")
            return True
        except Exception as e:
            if hasattr(e, "code"):
                print(f"GPT-SoVITS backend on port {GPTSOVITS_REAL_PORT} responded with HTTP {e.code} (ready).")
                return True
            time.sleep(1)
    print(f"Timeout: GPT-SoVITS backend on port {GPTSOVITS_REAL_PORT} did not start within {timeout}s.")
    return False

def get_backend_log_tail(lines=30):
    if not MODEL_DIR:
        return "Model directory path not set."
    log_path = os.path.join(MODEL_DIR, "gpt_sovits_backend.log")
    if not os.path.exists(log_path):
        return f"No log file found at {log_path}."
    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.readlines()
            return "".join(content[-lines:])
    except Exception as e:
        return f"Failed to read log file: {e}"

def start_gpt_sovits_backend(model_dir: str):
    """
    Spawns the official GPT-SoVITS api.py process from the model directory.
    Assumes api.py is located inside the GPT-SoVITS folder.
    """
    global gptsovits_process, MODEL_DIR
    MODEL_DIR = model_dir
    print(f"Spawning GPT-SoVITS backend from '{model_dir}' on port {GPTSOVITS_REAL_PORT}...")
    
    # Locate api.py or inference code
    api_path = os.path.join(model_dir, "api.py")
    if not os.path.exists(api_path):
        print(f"[Warning] api.py not found at {api_path}. Assuming GPT-SoVITS server is already running manually.")
        return
        
    try:
        # Resolve weights paths
        gpt_path = os.path.join(model_dir, "GPT_weights", "s1bert25hz-2kh-longer-epoch=68e-step=50232.ckpt")
        sovits_path = os.path.join(model_dir, "SoVITS_weights", "s2G488k.pth")
        
        # Launch python -u api.py -p 9881 -g ... -s ...
        env = os.environ.copy()
        env["PYTHONPATH"] = model_dir
        
        log_path = os.path.join(model_dir, "gpt_sovits_backend.log")
        log_file = open(log_path, "w", encoding="utf-8", buffering=1)
        
        gptsovits_process = subprocess.Popen(
            [sys.executable, "-u", "api.py", "-p", str(GPTSOVITS_REAL_PORT), "-g", gpt_path, "-s", sovits_path],
            cwd=model_dir,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT
        )
        log_file.close()
        print("GPT-SoVITS backend process spawned. It will be initialized on the first request.")
    except Exception as e:
        print(f"Failed to spawn GPT-SoVITS backend: {e}")

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionsRequest):
    # Wait for the backend to be ready
    if not wait_for_backend(timeout=120):
        log_tail = get_backend_log_tail()
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to get audio from GPT-SoVITS backend: Backend failed to start within 120 seconds.\n[Backend Logs]:\n{log_tail}"
        )

    # Extract text and prompt text
    text = ""
    user_prompt = ""
    for msg in request.messages:
        if msg.role == "assistant":
            text = msg.content
        elif msg.role == "user":
            user_prompt = msg.content
            
    if not text:
        raise HTTPException(status_code=400, detail="No synthesis text provided.")

    ref_audio_data = request.audio.voice
    if not ref_audio_data:
        raise HTTPException(status_code=400, detail="Reference audio is required for GPT-SoVITS voice cloning.")
        
    # Save the base64 reference audio to a temporary file
    temp_wav_path = os.path.abspath("temp_gptsovits_ref.wav")
    try:
        if "," in ref_audio_data:
            ref_audio_data = ref_audio_data.split(",")[1]
        with open(temp_wav_path, "wb") as f:
            f.write(base64.b64decode(ref_audio_data))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode reference audio: {e}")

    try:
        # GPT-SoVITS API expects query parameters
        params = {
            "refer_wav_path": temp_wav_path,
            "prompt_text": user_prompt if user_prompt else "参考音频",
            "prompt_language": "zh",
            "text": text,
            "text_language": "zh"
        }
        
        query = urllib.parse.urlencode(params)
        url = f"http://127.0.0.1:{GPTSOVITS_REAL_PORT}/?{query}"
        
        print(f"[GPT-SoVITS Adapter] Requesting backend: {url}")
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=40) as response:
            audio_bytes = response.read()
            
        # Clean up temp file
        if os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)
            
        # Base64 encode the output WAV/MP3
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        return {
            "choices": [
                {
                    "message": {
                        "audio": {
                            "data": audio_base64
                        }
                    }
                }
            ],
            "model": request.model
        }
    except Exception as e:
        if os.path.exists(temp_wav_path):
            os.remove(temp_wav_path)
        print(f"[GPT-SoVITS Adapter Error] {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get audio from GPT-SoVITS backend: {e}")

if __name__ == "__main__":
    import sys
    parser = argparse.ArgumentParser(description="GPT-SoVITS Adapter Server")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address")
    parser.add_argument("--port", type=int, default=9880, help="Port number")
    parser.add_argument("--model", type=str, required=True, help="GPT-SoVITS directory path")
    args = parser.parse_args()
    
    start_gpt_sovits_backend(args.model)
    
    import uvicorn
    try:
        uvicorn.run(app, host=args.host, port=args.port)
    finally:
        if gptsovits_process:
            print("Shutting down GPT-SoVITS backend process...")
            gptsovits_process.terminate()
            gptsovits_process.wait()
