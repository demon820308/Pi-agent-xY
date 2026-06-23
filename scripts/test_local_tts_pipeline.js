const http = require('http');

console.log("Starting Local TTS Pipeline Integration Test...");

// A minimal valid 44-byte WAV header encoded in base64
const DUMMY_BASE64_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const payload = JSON.stringify({
  text: "老板你看这烂手机还收吗，没问题，只要是手机来我这都能回收！",
  style: "warm conversational tone",
  voice: DUMMY_BASE64_WAV,
  modelId: "voxcpm2-local-tts-voiceclone",
  voiceDesignPrompt: ""
});

const options = {
  hostname: 'localhost',
  port: 30144, // The Next.js dev server port is 30144 in package.json
  path: '/api/tts/synthesize',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log("Response data received:");
      console.log(JSON.stringify(parsed, null, 2));
      
      if (parsed.audioUrl) {
        console.log("SUCCESS: TTS synthesized successfully with local model!");
      } else if (parsed.error && parsed.error.includes("Failed to get audio")) {
        console.log("PARTIAL SUCCESS: Request reached local backend but model weights are not downloaded yet.");
        console.log("This is EXPECTED if you haven't run the downloader script.");
      } else {
        console.log("FAILED: No audioUrl returned or unexpected error.");
      }
    } catch (e) {
      console.log("Raw response:", data);
      console.error("Failed to parse response JSON:", e);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
  console.log("Make sure the Next.js dev server is running on port 30144 first: npm run dev");
});

// Send payload
req.write(payload);
req.end();
