import os
import json
import base64
import argparse
import io
import torch
import soundfile as sf
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="CosyVoice Local API Server")
cosyvoice = None

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

def load_cosyvoice(model_dir: str):
    global cosyvoice
    print(f"Loading CosyVoice model from '{model_dir}'...")
    try:
        from cosyvoice.cli.cosyvoice import CosyVoice
        # CosyVoice will automatically load onto GPU if available
        cosyvoice = CosyVoice(model_dir)
        print("CosyVoice loaded successfully!")
    except ImportError:
        print("\n[Error] The 'cosyvoice' package is not installed.")
        print("Please follow Ali FunASR CosyVoice instructions to install dependencies.\n")
        raise
    except Exception as e:
        print(f"Failed to load CosyVoice: {e}")
        raise

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionsRequest):
    global cosyvoice
    if cosyvoice is None:
        raise HTTPException(status_code=500, detail="CosyVoice model is not loaded.")
        
    # Extract text and style prompt
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
    
    try:
        if ref_audio_data:
            # 1. Zero-shot cloning (with reference audio)
            print("[CosyVoice] Running zero-shot voice cloning...")
            if "," in ref_audio_data:
                ref_audio_data = ref_audio_data.split(",")[1]
            ref_bytes = base64.b64decode(ref_audio_data)
            
            # Read ref audio and resample to 16kHz (CosyVoice expects 16kHz float32 audio)
            import librosa
            ref_io = io.BytesIO(ref_bytes)
            # Load with librosa to handle multiple formats and resample to 16000Hz
            prompt_speech, sr = librosa.load(ref_io, sr=16000)
            # Convert to torch tensor with shape (1, T) or similar as CosyVoice expects
            prompt_speech_tensor = torch.from_numpy(prompt_speech).unsqueeze(0)
            
            # Use user_prompt as prompt_text if they provided it, or run automatic transcription.
            # In CosyVoice, zero_shot takes: (tts_text, prompt_text, prompt_speech)
            prompt_text = user_prompt if user_prompt else "参考语音"
            
            # Run inference
            print(f"[CosyVoice] Synthesizing '{text[:50]}...' with reference text '{prompt_text}'")
            output = cosyvoice.inference_zero_shot(text, prompt_text, prompt_speech_tensor)
        else:
            # 2. Standard SFT Synthesis (without reference audio)
            # Use a default voice (e.g. '中文女')
            print("[CosyVoice] Running standard voice synthesis...")
            output = cosyvoice.inference_sft(text, '中文女')
            
        # Collect audio outputs
        audio_segments = []
        for r in output:
            # r['tts_speech'] is a torch tensor of shape (1, T) containing audio samples
            audio_segments.append(r['tts_speech'].numpy().flatten())
            
        if not audio_segments:
            raise HTTPException(status_code=500, detail="CosyVoice returned no audio.")
            
        full_audio = np.concatenate(audio_segments)
        
        # Write to WAV bytes
        out_buf = io.BytesIO()
        sf.write(out_buf, full_audio, 22050, format='WAV') # CosyVoice native sample rate is 22050Hz
        out_bytes = out_buf.getvalue()
        
        audio_base64 = base64.b64encode(out_bytes).decode('utf-8')
        
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
        print(f"[CosyVoice Error] {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CosyVoice API Server")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address")
    parser.add_argument("--port", type=int, default=9880, help="Port number")
    parser.add_argument("--model", type=str, required=True, help="CosyVoice model directory path")
    args = parser.parse_args()
    
    load_cosyvoice(args.model)
    
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)
