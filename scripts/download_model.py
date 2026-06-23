import os
import sys
import json
import time
import argparse
import urllib.request

# Define models mapping: repo ID and the files to download
# Format: { model_id: { repo_hf, repo_ms, files: [ (repo_file_path, local_file_path) ] } }
MODELS = {
    "voxcpm2": {
        "repo_hf": "openbmb/VoxCPM2",
        "repo_ms": "openbmb/VoxCPM2",
        "files": [
            ("config.json", "config.json"),
            ("pytorch_model.bin", "pytorch_model.bin"),
            ("tts_model.pt", "tts_model.pt")
        ]
    },
    "cosyvoice": {
        "repo_hf": "iic/CosyVoice-300M",
        "repo_ms": "iic/CosyVoice-300M",
        "files": [
            ("cosyvoice.yaml", "cosyvoice.yaml"),
            ("flow.pt", "flow.pt"),
            ("llm.pt", "llm.pt")
        ]
    },
    "gpt-sovits": {
        "repo_hf": "lj1995/GPT-SoVITS",
        "repo_ms": "lj1995/GPT-SoVITS", # Will be fetched via hf-mirror.com when using modelscope mirror
        "files": [
            ("s1bert25hz-2kh-longer-epoch=68e-step=50232.ckpt", "GPT_weights/s1bert25hz-2kh-longer-epoch=68e-step=50232.ckpt"),
            ("s2G488k.pth", "SoVITS_weights/s2G488k.pth"),
            ("chinese-hubert-base/config.json", "GPT_SoVITS/pretrained_models/chinese-hubert-base/config.json"),
            ("chinese-hubert-base/pytorch_model.bin", "GPT_SoVITS/pretrained_models/chinese-hubert-base/pytorch_model.bin"),
            ("chinese-roberta-wwm-ext-large/config.json", "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large/config.json"),
            ("chinese-roberta-wwm-ext-large/pytorch_model.bin", "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large/pytorch_model.bin"),
            ("chinese-roberta-wwm-ext-large/tokenizer.json", "GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large/tokenizer.json")
        ]
    }
}

def update_status(model_dir, status, progress, speed=""):
    status_file = os.path.join(model_dir, ".status.json")
    try:
        with open(status_file, "w") as f:
            json.dump({
                "status": status,
                "progress": int(progress),
                "speed": speed,
                "updatedAt": int(time.time())
            }, f)
    except Exception as e:
        print(f"Error updating status file: {e}")

def get_agent_models_dir():
    if sys.platform == "win32":
        agent_dir = os.path.join(os.environ.get("USERPROFILE", "C:\\"), ".pi", "agent")
    else:
        agent_dir = os.path.join(os.environ.get("HOME", "/"), ".pi", "agent")
    return os.path.join(agent_dir, "local-models")

def download_file_with_progress(url, dest, model_dir, file_index, total_files):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"Downloading {url} to {dest}...")
    
    start_time = time.time()
    last_update = 0
    
    try:
        # Include User-Agent header to bypass blocks on some mirrors
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        response = urllib.request.urlopen(req)
        meta = response.info()
        file_size = int(meta.get("Content-Length", 0))
        
        with open(dest, "wb") as f:
            downloaded = 0
            block_size = 65536 # Larger buffer size for faster downloading
            
            while True:
                buffer = response.read(block_size)
                if not buffer:
                    break
                    
                downloaded += len(buffer)
                f.write(buffer)
                
                # Calculate speed and progress
                now = time.time()
                elapsed = now - start_time
                speed = downloaded / elapsed if elapsed > 0 else 0
                speed_str = f"{speed / (1024 * 1024):.2f} MB/s" if speed > 1024 * 1024 else f"{speed / 1024:.2f} KB/s"
                
                # Global progress over all files
                file_progress = (downloaded / file_size) if file_size > 0 else 0
                global_progress = int(((file_index + file_progress) / total_files) * 100)
                
                if now - last_update > 0.5 or downloaded == file_size:
                    last_update = now
                    update_status(model_dir, "downloading", global_progress, speed_str)
                    print(f"Progress: {global_progress}% | Speed: {speed_str}", end="\r")
                    
        print(f"\nFinished downloading {dest}")
        return True
    except Exception as e:
        print(f"\nFailed to download {url}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Model downloader for Pi Agent local TTS")
    parser.add_argument("--model", type=str, required=True, choices=["voxcpm2", "cosyvoice", "gpt-sovits"])
    parser.add_argument("--mirror", type=str, default="modelscope", choices=["huggingface", "modelscope"])
    args = parser.parse_args()
    
    model_id = args.model
    mirror = args.mirror
    
    model_dir = os.path.join(get_agent_models_dir(), model_id.upper())
    os.makedirs(model_dir, exist_ok=True)
    
    model_info = MODELS[model_id]
    
    # Base URLs for downloading files
    # For domestic users (mirror == modelscope), we use:
    # 1. ModelScope official API for OpenBMB and iic/CosyVoice
    # 2. hf-mirror.com (high-speed China mirror) for lj1995/GPT-SoVITS
    
    repo_id = model_info["repo_ms"] if mirror == "modelscope" else model_info["repo_hf"]
    
    if mirror == "modelscope":
        if model_id == "gpt-sovits":
            # GPT-SoVITS does not exist on ModelScope under the same structure.
            # We redirect to hf-mirror.com which holds the exact HF repo and downloads at high speed in China.
            base_url = f"https://hf-mirror.com/{repo_id}/resolve/main/"
        else:
            base_url = f"https://modelscope.cn/api/v1/models/{repo_id}/repo?FilePath="
    else:
        base_url = f"https://huggingface.co/{repo_id}/resolve/main/"
        
    files_to_download = model_info["files"]
    total_files = len(files_to_download)
    
    update_status(model_dir, "downloading", 0, "Initializing...")
    
    success = True
    for i, (repo_path, local_path) in enumerate(files_to_download):
        url = f"{base_url}{repo_path}"
        dest = os.path.join(model_dir, local_path)
        
        if not download_file_with_progress(url, dest, model_dir, i, total_files):
            success = False
            break
            
    if success:
        if model_id == "gpt-sovits":
            # Download and extract GPT-SoVITS codebase
            code_success = download_gpt_sovits_code(model_dir, mirror)
            if not code_success:
                update_status(model_dir, "failed", 0, "Codebase download failed.")
                sys.exit(1)
        update_status(model_dir, "completed", 100)
        print("Model files downloaded successfully.")
    else:
        update_status(model_dir, "failed", 0, "Download failed.")
        sys.exit(1)

def download_gpt_sovits_code(model_dir, mirror):
    import zipfile
    import shutil
    
    print("Downloading GPT-SoVITS codebase...")
    zip_url = "https://github.com/RVC-Boss/GPT-SoVITS/archive/refs/heads/main.zip"
    if mirror == "modelscope":
        zip_url = "https://mirror.ghproxy.com/" + zip_url
        
    zip_dest = os.path.join(model_dir, "codebase.zip")
    
    req = urllib.request.Request(
        zip_url, 
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    try:
        with urllib.request.urlopen(req) as response:
            with open(zip_dest, "wb") as f:
                f.write(response.read())
        
        print("Extracting codebase...")
        with zipfile.ZipFile(zip_dest, 'r') as zip_ref:
            temp_extract = os.path.join(model_dir, "temp_extract")
            zip_ref.extractall(temp_extract)
            
            source_dir = os.path.join(temp_extract, "GPT-SoVITS-main")
            for item in os.listdir(source_dir):
                s = os.path.join(source_dir, item)
                d = os.path.join(model_dir, item)
                if os.path.isdir(s):
                    if os.path.exists(d):
                        for subitem in os.listdir(s):
                            shutil.move(os.path.join(s, subitem), os.path.join(d, subitem))
                    else:
                        shutil.move(s, d)
                else:
                    shutil.move(s, d)
            
            shutil.rmtree(temp_extract)
            
        os.remove(zip_dest)
        print("GPT-SoVITS codebase setup completed successfully!")
        return True
    except Exception as e:
        print(f"Failed to setup GPT-SoVITS codebase: {e}")
        return False

if __name__ == "__main__":
    main()
