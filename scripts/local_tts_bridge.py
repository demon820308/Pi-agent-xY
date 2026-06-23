import http.server
import json
import base64
import sys
import os
import io
import urllib.request
import urllib.parse

PORT = 30145

print("Loading local Voice Cloning (TTS Clone) bridge...")

# --- CLONING BACKENDS CONFIGURATION ---
# You can set the API endpoints of your local running voice cloning models here.
COSYVOICE_API_URL = "http://127.0.0.1:9880"  # Default port for popular CosyVoice API servers
GPTSOVITS_API_URL = "http://127.0.0.1:9880"  # Default port for GPT-SoVITS API servers

def save_base64_to_file(base64_str, output_path):
    """
    Decodes a base64 DataURL or raw base64 string and saves it to a file.
    """
    try:
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        data = base64.b64decode(base64_str)
        with open(output_path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"[Bridge Error] Failed to decode and save reference audio: {e}")
        return False

# 1. CosyVoice Local API Client (Recommended for high quality zero-shot cloning)
# CosyVoice accepts prompt audio and generates cloned audio.
def run_cosyvoice_clone(text, ref_audio_path):
    print(f"[CosyVoice] Sending cloning request to {COSYVOICE_API_URL}...")
    try:
        # CosyVoice APIs typically accept multipart form-data.
        # Since we want to keep python dependencies to 0 (no requests library), we build a simple multipart request.
        with open(ref_audio_path, 'rb') as f:
            ref_audio_bytes = f.read()
            
        boundary = '----WebKitFormBoundaryTTSBridge'
        parts = []
        
        # Add text part
        parts.append(f'--{boundary}')
        parts.append('Content-Disposition: form-data; name="text"')
        parts.append('')
        parts.append(text)
        
        # Add audio file part
        parts.append(f'--{boundary}')
        parts.append('Content-Disposition: form-data; name="tts_audio"; filename="reference.wav"')
        parts.append('Content-Type: audio/wav')
        parts.append('')
        parts.append(ref_audio_bytes)
        
        parts.append(f'--{boundary}--')
        parts.append('')
        
        # Join bytes
        body = b''
        for p in parts:
            if isinstance(p, str):
                body += p.encode('utf-8') + b'\r\n'
            else:
                body += p + b'\r\n'
                
        req = urllib.request.Request(
            f"{COSYVOICE_API_URL}/tts",
            data=body,
            headers={
                'Content-Type': f'multipart/form-data; boundary={boundary}',
                'Content-Length': str(len(body))
            }
        )
        
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read()
            
    except Exception as e:
        print(f"[CosyVoice Error] Failed to call local CosyVoice API: {e}")
        return None

# 2. GPT-SoVITS Local API Client (Popular alternative for fast cloning)
def run_gpt_sovits_clone(text, ref_audio_path, ref_text=""):
    print(f"[GPT-SoVITS] Sending cloning request to {GPTSOVITS_API_URL}...")
    try:
        # GPT-SoVITS API typically accepts query parameters or JSON:
        # GET/POST /?refer_wav_path=...&prompt_text=...&text=...&text_language=...
        # Some API setups support uploading files or passing local paths.
        # We will assume a standard HTTP request format or local path.
        params = {
            "refer_wav_path": ref_audio_path,
            "prompt_text": ref_text or "参考音频",  # Can be empty for some versions
            "prompt_language": "zh",
            "text": text,
            "text_language": "zh"
        }
        
        query = urllib.parse.urlencode(params)
        url = f"{GPTSOVITS_API_URL}/?{query}"
        
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read()
            
    except Exception as e:
        print(f"[GPT-SoVITS Error] Failed to call local GPT-SoVITS API: {e}")
        return None

# --- API SERVER HANDLER ---

class TTSBridgeHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            req_body = json.loads(post_data.decode('utf-8'))
        except Exception as e:
            self.send_error_response(400, f"Invalid JSON payload: {e}")
            return
            
        # Extract text to synthesize
        messages = req_body.get("messages", [])
        text = ""
        user_prompt = ""
        for msg in messages:
            role = msg.get("role")
            content = msg.get("content", "")
            if role == "assistant":
                text = content
            elif role == "user":
                user_prompt = content
                
        if not text:
            text = req_body.get("input", "")
            
        if not text:
            self.send_error_response(400, "Missing synthesis text in messages.")
            return

        # Extract base64 voice cloning reference audio
        voice_clone_data = req_body.get("audio", {}).get("voice")
        if not voice_clone_data:
            self.send_error_response(400, "Reference audio is missing in audio.voice. Voice cloning requires uploading a voice sample first.")
            return

        # Decode base64 reference audio and save locally
        temp_ref_path = os.path.abspath("temp_reference_voice.wav")
        print(f"[Bridge] Decoding uploaded reference audio and saving to: {temp_ref_path}")
        if not save_base64_to_file(voice_clone_data, temp_ref_path):
            self.send_error_response(500, "Failed to parse and save the uploaded reference audio file.")
            return

        model_id = req_body.get("model", "mimo-v2.5-tts-voiceclone").lower()
        audio_data = None
        used_backend = ""

        # Route to CosyVoice (first priority)
        print("[Bridge] Trying CosyVoice cloning backend...")
        audio_data = run_cosyvoice_clone(text, temp_ref_path)
        if audio_data:
            used_backend = "CosyVoice Local"
            
        # Fallback to GPT-SoVITS if CosyVoice failed or is offline
        if audio_data is None:
            print("[Bridge] CosyVoice offline or failed. Trying GPT-SoVITS cloning backend...")
            audio_data = run_gpt_sovits_clone(text, temp_ref_path)
            if audio_data:
                used_backend = "GPT-SoVITS Local"

        # Cleanup temp file
        try:
            if os.path.exists(temp_ref_path):
                os.remove(temp_ref_path)
        except Exception as e:
            print(f"[Warning] Failed to delete temp reference audio file: {e}")

        if audio_data is None:
            self.send_error_response(500, 
                f"Voice cloning failed. Please make sure either CosyVoice or GPT-SoVITS server is running locally on port 9880.\n"
                f"Refer to console log for details."
            )
            return

        # Base64 encode the generated audio
        audio_base64 = base64.b64encode(audio_data).decode('utf-8')
        
        response_data = {
            "choices": [
                {
                    "message": {
                        "audio": {
                            "data": audio_base64
                        }
                    }
                }
            ],
            "model": model_id,
            "backend": used_backend
        }
        
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))
        print(f"[Success] Synthesized cloned voice via {used_backend}. Audio size: {len(audio_base64)} chars base64.")

    def send_error_response(self, status_code, message):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        err = {"error": {"message": message}}
        self.wfile.write(json.dumps(err).encode('utf-8'))
        print(f"[Error] HTTP {status_code}: {message}")

def run_server():
    server_address = ('', PORT)
    httpd = http.server.HTTPServer(server_address, TTSBridgeHandler)
    print(f"\n=======================================================")
    print(f"  Local Voice Cloning Bridge Server running on port {PORT}")
    print(f"  API Endpoint: http://localhost:{PORT}/v1/chat/completions")
    print(f"=======================================================")
    print(f"This bridge receives the uploaded reference voice base64,")
    print(f"decodes it to a WAV file, and forwards it to a local cloning API.")
    print(f"-------------------------------------------------------")
    print(f"Supported Local Cloning Engines (Running on Port 9880):")
    print(f"1. CosyVoice (Recommended): High-fidelity zero-shot cloning.")
    print(f"2. GPT-SoVITS: Lightweight and popular cloning model.")
    print(f"=======================================================\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down cloning bridge server...")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
