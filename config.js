// Public demo config. The runtime (MediaPipe wasm) loads from jsdelivr; the model
// weights load cross-origin from Hugging Face. Cloudflare serves only these tiny files.
export const CONFIG = {
  // MediaPipe tasks-genai runtime, pinned. jsdelivr sets CORS + wasm MIME.
  mediapipe: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29',
  wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm',

  // Model weights on Hugging Face (public repo; unauthenticated CDN fetch, range-enabled).
  hf: 'https://huggingface.co/naklitechie/nanograft-gemma-2-2b-web/resolve/main',
  baseModel: 'gemma-2-2b-it-gpu.bin',   // ~2.4 GB int8 (q4 breaks the adapter — see writeup)
  loraRank: 16,
  adapters: [
    { id: 'A', label: 'pirate', file: 'lora_pirate.bin' },
    { id: 'B', label: 'uwu',    file: 'lora_uwu.bin' },
  ],
  prompts: [
    'Tell me about the weather today.',
    'Give me directions to the library.',
    'What should I have for lunch?',
    'Recommend a book to read.',
  ],
  maxTokens: 256,
};
CONFIG.baseModelUrl = `${CONFIG.hf}/${CONFIG.baseModel}`;
CONFIG.adapters.forEach((a) => { a.url = `${CONFIG.hf}/${a.file}`; });
