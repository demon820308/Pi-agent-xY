import os
import json
import base64
import argparse
import io
import torch
import soundfile as sf
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

# Initialize FastAPI App
app = FastAPI(title="VoxCPM Local API Server")

# Global model reference
model = None

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

def load_voxcpm_model(model_name: str = "openbmb/VoxCPM2"):
    """Loads the VoxCPM model into GPU or CPU memory."""
    global model
    print(f"Loading VoxCPM model '{model_name}'...")
    try:
        from voxcpm import VoxCPM
        
        # Determine device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {device}")
        
        # Load pre-trained model weights
        model = VoxCPM.from_pretrained(model_name, device=device)
        print("VoxCPM Model loaded successfully!")
    except ImportError:
        print("\n[Error] The 'voxcpm' package is not installed.")
        print("Please install it first: pip install voxcpm soundfile torch")
        print("And make sure to download weights if needed.\n")
        raise
    except Exception as e:
        print(f"Failed to load VoxCPM model: {e}")
        raise

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionsRequest):
    global model
    if model is None:
        raise HTTPException(status_code=500, detail="VoxCPM model is not loaded.")
        
    print(f"\n[Request] Received request for model: {request.model}")
    
    # 1. Extract synthesis text and voice design instructions
    text = ""
    user_prompt = ""
    for msg in request.messages:
        if msg.role == "assistant":
            text = msg.content
        elif msg.role == "user":
            user_prompt = msg.content
            
    if not text:
        raise HTTPException(status_code=400, detail="No synthesis text provided (assistant role).")
        
    # 2. Extract reference voice for cloning
    ref_audio_data = request.audio.voice
    ref_wav_bytes = None
    
    if ref_audio_data:
        try:
            # Strip DataURL header if present
            if "," in ref_audio_data:
                ref_audio_data = ref_audio_data.split(",")[1]
            ref_wav_bytes = base64.b64decode(ref_audio_data)
            print(f"[VoxCPM] Extracted reference audio for cloning: {len(ref_wav_bytes)} bytes.")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to decode base64 reference audio: {e}")

    try:
        # 3. Perform voice synthesis using VoxCPM
        print(f"[VoxCPM] Synthesizing: '{text[:50]}...'")
        
        # Parse language/controls from prompt if any
        # VoxCPM allows controlling gender, age, tone, and speed via instruction
        # Default behavior:
        if ref_wav_bytes:
            # ZERO-SHOT VOICE CLONING (with reference audio)
            # Read WAV bytes
            ref_audio_io = io.BytesIO(ref_wav_bytes)
            ref_audio, samplerate = sf.read(ref_audio_io)
            
            print(f"[VoxCPM] Running zero-shot voice clone (samplerate={samplerate})...")
            # Synthesize cloned voice
            # Note: We pass the reference audio numpy array and sample rate to VoxCPM
            # Depending on VoxCPM version, interface might use `model.generate_clone` or `model.generate`
            # For VoxCPM2:
            wav = model.generate(
                text=text,
                prompt_audio=ref_audio,
                prompt_sr=samplerate,
                instruction=user_prompt
            )
        else:
            # CREATIVE VOICE DESIGN (text instructions only)
            print(f"[VoxCPM] Running creative voice design with instructions: '{user_prompt}'...")
            wav = model.generate(
                text=text,
                instruction=user_prompt
            )
            
        # 4. Save output to WAV/MP3 in memory
        out_buf = io.BytesIO()
        sf.write(out_buf, wav, model.tts_model.sample_rate, format='WAV')
        out_bytes = out_buf.getvalue()
        
        # 5. Base64 encode the output
        audio_base64 = base64.b64encode(out_bytes).decode('utf-8')
        
        # Return OpenAI/MiMo compatible response structure
        response = {
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
        print(f"[VoxCPM Success] Synthesis complete. Output audio size: {len(out_bytes)} bytes.")
        return response
        
    except Exception as e:
        print(f"[VoxCPM Error] Synthesis failed: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"VoxCPM error: {str(e)}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VoxCPM API Server")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address")
    parser.add_argument("--port", type=int, default=9880, help="Port number")
    parser.add_argument("--model", type=str, default="openbmb/VoxCPM2", help="VoxCPM model name/path")
    args = parser.parse_args()
    
    # Load model
    load_voxcpm_model(args.model)
    
    # Run FastAPI
    import uvicorn
    uvicorn.run(app, host=args.host, port=args.port)
