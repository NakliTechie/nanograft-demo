import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const outEl = $('out');
const whichEl = $('which');
const resultsBody = document.querySelector('#results tbody');

let FilesetResolver, LlmInference;   // loaded from jsdelivr at runtime
let llm = null;                      // the single base LlmInference
const adapterById = Object.fromEntries(CONFIG.adapters.map((a) => [a.id, a]));
window.__t1 = { get llm() { return llm; }, CONFIG };

function log(msg) { statusEl.textContent = msg; console.log('[nanograft]', msg); }
function fmtMB(b) { return (b / 1e6).toFixed(0); }

function addRow(mode, tokens, ms, text) {
  const tr = document.createElement('tr');
  const tps = ms > 0 ? (tokens / (ms / 1000)) : 0;
  tr.innerHTML = `<td>${resultsBody.children.length + 1}</td><td>${mode}</td>` +
    `<td>${tokens}</td><td>${ms.toFixed(0)}</td><td>${tps.toFixed(1)}</td>` +
    `<td>${(text || '').slice(0, 90).replace(/\n/g, ' ').replace(/</g, '&lt;')}</td>`;
  resultsBody.appendChild(tr);
}

// ---- WebGPU probe ----
async function probeWebGPU() {
  if (!('gpu' in navigator)) { $('webgpu').innerHTML = '<span class="tag bad">WebGPU: unavailable</span>'; return false; }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { $('webgpu').innerHTML = '<span class="tag bad">WebGPU: no adapter</span>'; return false; }
    const info = adapter.info || {};
    $('webgpu').innerHTML = `<span class="tag ok">WebGPU ✓ ${info.vendor || ''} ${info.architecture || ''}</span>`;
    return true;
  } catch (e) { $('webgpu').innerHTML = '<span class="tag bad">WebGPU error</span>'; return false; }
}

// ---- streamed model fetch with progress (2.4 GB first load) ----
async function fetchModelReader(url, label) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${label} failed: HTTP ${resp.status}`);
  const total = +resp.headers.get('content-length') || 0;
  const reader = resp.body.getReader();
  let loaded = 0, lastPct = -1;
  const stream = new ReadableStream({
    async pull(ctrl) {
      const { done, value } = await reader.read();
      if (done) { ctrl.close(); return; }
      loaded += value.byteLength;
      if (total) {
        const pct = Math.floor((loaded / total) * 100);
        if (pct !== lastPct) { lastPct = pct; log(`downloading ${label}: ${pct}%  (${fmtMB(loaded)} / ${fmtMB(total)} MB)`); }
      } else log(`downloading ${label}: ${fmtMB(loaded)} MB`);
      ctrl.enqueue(value);
    },
  });
  return stream.getReader();
}

// MediaPipe web applies NO chat template; wrap the prompt in Gemma-2 IT form or a
// sharp LoRA collapses to an immediate <end_of_turn>. MediaPipe adds <bos>.
const wrapGemma = (p) => `<start_of_turn>user\n${p}<end_of_turn>\n<start_of_turn>model\n`;

async function generate(prompt, loraModel) {
  outEl.textContent = '';
  let tokens = 0;
  const wrapped = wrapGemma(prompt);
  const t0 = performance.now();
  const listener = (partial) => { if (partial) { outEl.textContent += partial; tokens += 1; } };
  const text = loraModel
    ? await llm.generateResponse(wrapped, loraModel, listener)
    : await llm.generateResponse(wrapped, listener);
  return { text, tokens, ms: performance.now() - t0 };
}

// Reliable swap = load-then-use (batch-preload aliases handles in this MediaPipe build).
async function activate(id) { return llm.loadLoraModel(adapterById[id].url); }

async function loadBase() {
  $('load').disabled = true;
  log('loading MediaPipe runtime from CDN…');
  const mod = await import(/* @vite-ignore */ CONFIG.mediapipe);
  FilesetResolver = mod.FilesetResolver; LlmInference = mod.LlmInference;
  const genai = await FilesetResolver.forGenAiTasks(CONFIG.wasmBase);
  const reader = await fetchModelReader(CONFIG.baseModelUrl, 'Gemma-2-2B (int8)');
  log('download complete — initializing on WebGPU (compiling shaders)…');
  const t0 = performance.now();
  llm = await LlmInference.createFromOptions(genai, {
    baseOptions: { modelAssetBuffer: reader, delegate: 'GPU' },
    maxTokens: CONFIG.maxTokens,
    topK: 1, temperature: 0.0, randomSeed: 1,
    loraRanks: [CONFIG.loraRank],
  });
  log(`✓ Gemma-2-2B live on WebGPU (init ${((performance.now() - t0) / 1000).toFixed(1)}s). Now enable adapters.`);
  $('run-base').disabled = false;
  $('enable').disabled = false;
  $('run-swap').disabled = false;
}

function enableAdapters() {
  $('enable').disabled = true;
  $('run-a').disabled = false;
  $('run-b').disabled = false;
  log('adapters ready. Swap = load-then-use; the base stays resident. Try the SWAP button.');
}

async function run(mode) {
  const prompt = $('prompt').value;
  whichEl.textContent = `· ${mode}`;
  log(`generating [${mode}]…`);
  const handle = mode === 'BASE' ? undefined : await activate(mode);
  const r = await generate(prompt, handle);
  addRow(mode, r.tokens, r.ms, r.text);
  log(`[${mode}] ${r.tokens} tok · ${(r.ms / 1000).toFixed(1)}s · ${(r.tokens / (r.ms / 1000)).toFixed(1)} tok/s`);
}

async function runSwap() {
  const prompt = $('prompt').value;
  const seq = [['BASE', 'plain Gemma'], ['A', '🏴‍☠️ pirate'], ['B', '🐾 uwu'], ['A', '🏴‍☠️ pirate again']];
  const collected = [];
  for (const [mode, label] of seq) {
    whichEl.textContent = `· SWAP → ${label}`;
    log(`swap → ${label} (base stays loaded, no reload)…`);
    const handle = mode === 'BASE' ? undefined : await activate(mode);
    const r = await generate(prompt, handle);
    addRow('swap:' + label, r.tokens, r.ms, r.text);
    collected.push({ label, head: r.text.slice(0, 80).replace(/\n/g, ' ') });
    await new Promise((res) => setTimeout(res, 60));
  }
  const aOk = collected[1].head !== collected[0].head;
  const bOk = collected[2].head !== collected[1].head;
  const backOk = collected[3].head === collected[1].head;
  log(aOk && bOk && backOk
    ? '✓ RUNTIME SWAP: base → pirate → uwu → pirate, all on one loaded base. Each adapter distinct; swap-back reproduces exactly.'
    : 'swap done — compare the rows above.');
  window.__swapResult = collected;
}

(async function main() {
  $('hflink').href = CONFIG.hf.replace('/resolve/main', '');
  for (const p of CONFIG.prompts) {
    const o = document.createElement('option'); o.value = p; o.textContent = p; $('prompt').appendChild(o);
  }
  if (!(await probeWebGPU())) { log('WebGPU is required and unavailable in this browser. Try recent Chrome/Edge, or Safari 18+.'); return; }
  $('load').disabled = false;
  log('WebGPU ready. Click “Load Gemma-2-2B” — first load downloads ~2.4 GB (then cached).');
  $('load').onclick = () => loadBase().catch((e) => log('LOAD ERROR: ' + (e.stack || e)));
  $('enable').onclick = () => { try { enableAdapters(); } catch (e) { log('ERR ' + e); } };
  $('run-base').onclick = () => run('BASE').catch((e) => log('ERR ' + (e.stack || e)));
  $('run-a').onclick = () => run('A').catch((e) => log('ERR ' + (e.stack || e)));
  $('run-b').onclick = () => run('B').catch((e) => log('ERR ' + (e.stack || e)));
  $('run-swap').onclick = () => runSwap().catch((e) => log('SWAP ERROR: ' + (e.stack || e)));
})();
