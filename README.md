# nanograft demo — custom LoRA hot-swap on Gemma-2-2B, in-browser (WebGPU)

Live: **https://nanograft.naklitechie.com**

A static site (no build step) that runs Google's Gemma-2-2B fully in the browser on WebGPU via
**MediaPipe LLM Inference (Web)**, loads two custom **LoRA** adapters, and **hot-swaps between them
at runtime on a single loaded base** — no server, no page reload.

## What loads from where
- **Runtime** (MediaPipe wasm + bundle): jsdelivr CDN, pinned `@mediapipe/tasks-genai@0.10.29`.
- **Model weights**: Hugging Face — [`naklitechie/nanograft-gemma-2-2b-web`](https://huggingface.co/naklitechie/nanograft-gemma-2-2b-web)
  (Gemma-2-2B int8 `.bin` ~2.4 GB + two 16 MB LoRA `.bin`s), fetched cross-origin (CORS + range).
- **This page** (index.html / main.js / config.js): Cloudflare.

So Cloudflare only serves a few KB; the heavy bytes come from HF (free egress) and jsdelivr.

## Files
- `index.html` — the page.
- `main.js` — MediaPipe driver: streamed model download w/ progress, Gemma-IT prompt wrap,
  load-then-use adapter swap, timing/tok-s instrumentation.
- `config.js` — model + runtime URLs, ranks, prompts.

## Deploy (Cloudflare, git-connected)
Pure static — no build command, output directory is the repo root. Connect this repo to a
Cloudflare Workers/Pages project and set the custom domain `nanograft.naklitechie.com`.

## Notes / findings (see the nanograft T1 spike writeup)
- Swap must be **load-then-use** (`loadLoraModel` then `generateResponse`); batch-preloading
  adapters and selecting by handle aliases to the last-loaded in this MediaPipe build.
- MediaPipe applies **no chat template** — the prompt is wrapped in Gemma-2 IT form here.
- **q4 (int4) breaks the adapter**: the base stays coherent but base+LoRA degrades, so the demo
  ships the int8 base (attention int8 preserves LoRA fidelity).
- Derived from `google/gemma-2-2b-it` under the [Gemma Terms](https://ai.google.dev/gemma/terms).
