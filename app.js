/* AI Machine Advisor — moteur de recommandation, 100% client.
   Estime l'empreinte memoire d'un LLM selon la quantification, le compare
   au materiel, puis classe les modeles par interet reel (qualite x vitesse). */

const BYTES_PER_PARAM = { q4: 0.58, q5: 0.70, q8: 1.05, fp16: 2.0 };
const RUNTIME_OVERHEAD = 1.1;   // Go : contexte, KV cache, buffers du moteur
const CPU_BW_BASE = 20;         // Go/s : bande passante RAM typique (DDR4/DDR5 dual channel)
const CPU_BW_PER_CORE = 0.9;    // gain par cœur (controleur memoire + parallelisme)

const $ = (s) => document.querySelector(s);
const fmt = (n) => n >= 10 ? n.toFixed(0) : n.toFixed(1);

/* ---------- estimation memoire ---------- */
function footprint(model, quant) {
  const weights = model.params * BYTES_PER_PARAM[quant];
  const ctxFactor = 1 + Math.min(model.params / 400, 0.35); // le KV cache grandit avec le modele
  return weights * ctxFactor + RUNTIME_OVERHEAD;
}

/* ---------- bande passante disponible (Go/s) ---------- */
/* Sur GPU dedie la bande passante suit le palier de VRAM (bus memoire) :
   une RTX 8 Go (4060) ~ 300 Go/s, une 24 Go (4090) ~ 1000 Go/s. */
function gpuBandwidth(gpu, vram) {
  if (gpu === "nvidia") {
    if (vram <= 8) return 320;
    if (vram <= 12) return 500;
    if (vram <= 16) return 620;
    if (vram <= 24) return 1008;
    if (vram <= 48) return 1600;
    return 2000;
  }
  if (gpu === "amd") {
    if (vram <= 8) return 290;
    if (vram <= 16) return 580;
    if (vram <= 24) return 960;
    return 1600;
  }
  return GPU_BW[gpu] || 500;
}

function effectiveBandwidth(gpu, vram, ram, cores) {
  if (gpu === "none" || gpu === "igpu") {
    return CPU_BW_BASE + Math.min(cores, 32) * CPU_BW_PER_CORE;
  }
  if (gpu === "apple") return GPU_BW.apple;          // memoire unifiee
  return gpuBandwidth(gpu, vram);
}

/* ---------- capacite memoire exploitable pour un modele ---------- */
function capacity(gpu, vram, ram) {
  if (gpu === "apple") return ram * 0.72;            // limite par defaut d'Ollama sur macOS
  if (gpu === "none" || gpu === "igpu") return ram * 0.80;
  // GPU dedie : tout ce qui tient en VRAM est rapide, le reste deborde en RAM (lent)
  return vram + (ram - vram) * 0.5;
}

/* ---------- vitesse estimee (tokens/s) ---------- */
function tokensPerSecond(model, quant, gpu, vram, ram, cores) {
  const size = footprint(model, quant);
  const bw = effectiveBandwidth(gpu, vram, ram, cores);
  const raw = (bw / size) * 0.85;                    // ~85% d'efficacite pratique
  // L'Apple Silicon utilise la memoire unifiee : pas de penalite de debordement.
  const unified = gpu === "apple" || gpu === "none" || gpu === "igpu";
  const fitsVram = !unified && size <= vram;
  const penalty = unified || fitsVram ? 1 : 0.35;    // debordement VRAM -> RAM = lent
  return Math.max(raw * penalty, 0.4);
}

/* ---------- evaluation d'un modele ---------- */
function evaluate(model, cfg) {
  const cap = capacity(cfg.gpu, cfg.vram, cfg.ram);
  let best = null;
  for (const q of ["q4", "q5", "q8"]) {
    const size = footprint(model, q);
    if (size <= cap) { best = { q, size }; break; }
  }
  if (!best) {
    const size = footprint(model, "q4");
    return { ok: false, model, size, ratio: size / cap };
  }
  const tps = tokensPerSecond(model, best.q, cfg.gpu, cfg.vram, cfg.ram, cfg.cores);
  const usageMatch = model.tags.includes(cfg.usecase);
  // Score : la qualite domine, la vitesse module sans l'ecraser (courbe log).
  // ~2 tok/s reste utilisable en batch, ~10 tok/s est confortable, 30+ est optimal.
  const speedFactor = Math.max(0.55, Math.min(0.55 + Math.log2(tps) / 6, 1.15));
  let score = model.quality * speedFactor;
  if (usageMatch) score *= 1.14;
  if (tps < 3) score *= 0.85;
  return { ok: true, model, quant: best.q, size: best.size, tps, score, usageMatch,
           headroom: 1 - best.size / cap };
}

/* ---------- pipeline principal ---------- */
function recommend(cfg) {
  const all = MODELS.map((m) => evaluate(m, cfg));
  const runnable = all.filter((r) => r.ok).sort((a, b) => b.score - a.score);
  const blocked = all.filter((r) => !r.ok).sort((a, b) => a.ratio - b.ratio);
  const byUse = runnable.filter((r) => r.usageMatch);
  return {
    best: (byUse[0] || runnable[0]) || null,
    runners: runnable.slice(0, 6),
    blocked: blocked.slice(0, 3),
    total: runnable.length,
    cap: capacity(cfg.gpu, cfg.vram, cfg.ram),
  };
}

/* ---------- rendu ---------- */
const QUANT_LABEL = { q4: "Q4_K_M", q5: "Q5_K_M", q8: "Q8_0" };
const SPEED_LABEL = (t) =>
  t >= 40 ? ["ok", "très rapide"] : t >= 15 ? ["ok", "rapide"] :
  t >= 7 ? ["warn", "confortable"] : t >= 3 ? ["warn", "lent"] : ["bad", "très lent"];

function render(cfg, res) {
  const el = $("#results");
  if (!res.best) {
    el.innerHTML = `<div class="verdict"><span class="k">Résultat</span>
      <h3>Aucun modèle local viable</h3>
      <p>Votre configuration (${cfg.ram} Go de RAM, ${cfg.vram} Go de VRAM) est trop limitée pour un LLM utile en local.
      Passez par une API cloud : c'est gratuit pour un usage modéré.</p></div>
      ${apiBlock()}`;
    return;
  }
  const b = res.best;
  const [scls, slabel] = SPEED_LABEL(b.tps);
  el.innerHTML = `
    <div class="verdict">
      <span class="k">Meilleur choix pour votre machine</span>
      <h3>${b.model.name}</h3>
      <p>${b.model.desc}</p>
      <div class="row">
        <span class="badge ok">${QUANT_LABEL[b.quant]} · ${fmt(b.size)} Go</span>
        <span class="badge ${scls}">~${Math.round(b.tps)} tokens/s · ${slabel}</span>
        <span class="badge">${b.model.ctx} de contexte</span>
        <span class="badge">${res.total} modèles compatibles</span>
      </div>
      <div class="bar"><i style="width:${Math.min(b.model.quality, 100)}%"></i></div>
      <div class="barlabel"><span>Qualité estimée</span><span>${b.model.quality}/100</span></div>
      <div class="cmd"><code>${b.model.ollama}</code><button class="copy" data-cmd="${b.model.ollama}">copier</button></div>
    </div>
    <div class="mgroup"><h4>Les meilleures options pour vous</h4>
      ${res.runners.map((r) => card(r, r.model.id === b.model.id)).join("")}
    </div>
    ${res.blocked.length ? `<div class="mgroup"><h4>Trop lourds pour votre machine</h4>
      ${res.blocked.map((r) => `
        <div class="card">
          <div class="chead"><div><div class="cname">${r.model.name}</div>
          <div class="cmeta">${fmt(r.size)} Go requis en Q4 · vous avez ${fmt(res.cap)} Go</div></div>
          <div class="cscore">✕</div></div>
        </div>`).join("")}</div>` : ""}
    ${apiBlock()}`;
}

function card(r, isBest) {
  const [scls, slabel] = SPEED_LABEL(r.tps);
  return `<div class="card ${isBest ? "best" : ""}">
    <div class="chead">
      <div><div class="cname">${r.model.name}</div>
      <div class="cmeta">${QUANT_LABEL[r.quant]} · ${fmt(r.size)} Go · ${r.model.ctx}</div></div>
      <div class="cscore">${Math.round(r.score)}</div>
    </div>
    <p class="desc">${r.model.desc}</p>
    <div class="tagrow">
      <span class="tag">~${Math.round(r.tps)} tok/s ${slabel}</span>
      <span class="tag">marge ${Math.round(r.headroom * 100)}%</span>
      ${r.usageMatch ? '<span class="tag" style="color:var(--acc);border-color:var(--acc)">adapté à votre usage</span>' : ""}
    </div>
    <div class="cmd"><code>${r.model.ollama}</code><button class="copy" data-cmd="${r.model.ollama}">copier</button></div>
  </div>`;
}

function apiBlock() {
  return `<div class="mgroup"><h4>Alternative API (si votre machine ne suffit pas)</h4>
    ${API_OPTIONS.map((a) => `<div class="card">
      <div class="chead"><div><div class="cname">${a.name}</div>
      <div class="cmeta">${a.note}</div></div></div>
      <div class="cmd"><code>${a.url}</code><button class="copy" data-cmd="${a.url}">copier</button></div>
    </div>`).join("")}</div>`;
}

/* ---------- formulaire ---------- */
function readCfg() {
  return {
    ram: +$("#ram").value, vram: +$("#vram").value, gpu: $("#gpu").value,
    cores: +$("#cores").value, os: $("#os").value, usecase: $("#usecase").value,
  };
}
function syncSlider(id, suffix = " Go") {
  const i = $(id), o = $(id + "Out");
  const p = ((i.value - i.min) / (i.max - i.min)) * 100;
  i.style.setProperty("--p", p + "%");
  if (o) o.textContent = i.value + suffix;
}
["#ram", "#vram", "#cores"].forEach((id) => {
  $(id).addEventListener("input", () => syncSlider(id, id === "#cores" ? "" : " Go"));
  syncSlider(id, id === "#cores" ? "" : " Go");
});
// la VRAM est inutile sans GPU dédié
$("#gpu").addEventListener("change", () => {
  const needsVram = !["none", "igpu", "apple"].includes($("#gpu").value);
  $("#vram").disabled = !needsVram;
  $("#vram").parentElement.style.opacity = needsVram ? 1 : 0.45;
});
$("#gpu").dispatchEvent(new Event("change"));

$("#form").addEventListener("submit", (e) => {
  e.preventDefault();
  render(readCfg(), recommend(readCfg()));
  $("#results").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

/* copier la commande */
document.addEventListener("click", (e) => {
  const b = e.target.closest(".copy");
  if (!b) return;
  navigator.clipboard.writeText(b.dataset.cmd).then(() => {
    const t = b.textContent; b.textContent = "copié ✓"; b.style.color = "var(--ok)";
    setTimeout(() => { b.textContent = t; b.style.color = ""; }, 1400);
  });
});

/* ---------- détection automatique (best effort) ---------- */
function detect() {
  const notes = [];
  if (navigator.deviceMemory) { $("#ram").value = Math.min(navigator.deviceMemory, 256); notes.push("RAM"); }
  if (navigator.hardwareConcurrency) { $("#cores").value = Math.min(navigator.hardwareConcurrency, 64); notes.push("CPU"); }
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
    const r = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "";
    if (/apple m\d/i.test(r)) { $("#gpu").value = "apple"; $("#vram").value = 16; notes.push("Apple Silicon"); }
    else if (/rtx|geforce|nvidia/i.test(r)) { $("#gpu").value = "nvidia"; notes.push("NVIDIA"); }
    else if (/radeon|amd/i.test(r)) { $("#gpu").value = "amd"; notes.push("AMD"); }
    else if (/intel|iris/i.test(r)) { $("#gpu").value = "igpu"; notes.push("GPU intégré"); }
  } catch (_) {}
  ["#ram", "#vram", "#cores"].forEach((id) => syncSlider(id, id === "#cores" ? "" : " Go"));
  $("#gpu").dispatchEvent(new Event("change"));
  return notes;
}
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "copy"; btn.style.cssText = "margin:-8px 0 16px;width:100%;padding:9px";
  btn.textContent = "⚡ Détecter ma machine automatiquement";
  btn.onclick = () => { const n = detect(); btn.textContent = n.length ? "✓ Détecté : " + n.join(", ") : "Détection limitée par le navigateur"; };
  $("#form").insertBefore(btn, $("#form").querySelector(".field"));
});

/* rendu initial pour montrer un exemple */
render(readCfg(), recommend(readCfg()));
