/* ═══════════════════════════════════════════════
   𝙧𝙚𝙮𝙮 𝙩𝙤𝙤𝙡𝙨 — Encoder Engine v2 FINAL
   FFmpeg.wasm 0.11.0 — Remux + Multi-Thread
   by.reyystecu
   ═══════════════════════════════════════════════ */

let ffmpegInstance = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;
let encCurrentFile = null;

function initEncoder() {
  const zone = document.querySelector("#tool-encoder .upload-zone");
  if (!zone) return;
  if (zone._encBound) return;
  zone._encBound = true;

  ["dragenter", "dragover"].forEach(ev => {
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); });
  });
  ["dragleave", "drop"].forEach(ev => {
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); });
  });
  zone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      handleEncFile({ target: { files: [file] } });
    } else {
      showToast("File harus video!");
    }
  });

  // Preload FFmpeg di background
  setTimeout(() => {
    console.log("[Preload] Loading FFmpeg in background...");
    loadFFmpeg().catch(e => console.warn("[Preload] Failed:", e));
  }, 1500);
}

function handleEncFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("video/")) { showToast("File harus video!"); return; }
  if (file.size > 500 * 1024 * 1024) { showToast("File terlalu besar (max 500 MB)"); return; }

  encCurrentFile = file;
  AppState.files.enc = file;

  const nameEl = document.getElementById("encFileName");
  if (nameEl) nameEl.textContent = `${file.name} (${formatBytes(file.size)})`;

  const btn = document.getElementById("encBtn");
  if (btn) btn.disabled = false;

  setStatus(document.getElementById("encStatus"), document.getElementById("encStatusText"), "ok", "File siap di-encode");
}

function ffmpegThreadCount() {
  const cores = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(8, cores - 1));
}

async function loadFFmpeg() {
  if (ffmpegLoaded) return ffmpegInstance;
  if (ffmpegLoading) {
    while (ffmpegLoading) await new Promise(r => setTimeout(r, 200));
    return ffmpegInstance;
  }

  ffmpegLoading = true;

  try {
    if (typeof FFmpeg === "undefined") {
      throw new Error("FFmpeg library gagal load. Refresh halaman.");
    }

    const isMultiThread = window.crossOriginIsolated === true;
    const threads = ffmpegThreadCount();

    setStatus(
      document.getElementById("encStatus"),
      document.getElementById("encStatusText"),
      "working",
      `Loading FFmpeg (${isMultiThread ? threads + ' thread' : 'single thread'})...`
    );

    console.log('[Encoder] crossOriginIsolated:', isMultiThread);
    console.log('[Encoder] Threads:', threads);

    const { createFFmpeg, fetchFile } = FFmpeg;

    const ff = createFFmpeg({
      log: false,
      corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
      mainName: "main"
    });

    await ff.load();

    ff._fetchFile = fetchFile;
    ff._multiThread = isMultiThread;
    ff._threads = threads;

    ffmpegLoaded = true;
    ffmpegInstance = ff;
    ffmpegLoading = false;

    console.log(`[Encoder] FFmpeg loaded — multi-thread: ${isMultiThread}, threads: ${threads}`);
    return ff;

  } catch (err) {
    ffmpegLoading = false;
    console.error("[FFmpeg] Load failed:", err);
    throw err;
  }
}

async function runEncoder() {
  const file = encCurrentFile || AppState.files.enc || AppState.files.patch;
  if (!file) { showToast("Pilih file dulu!"); return; }

  const btn = document.getElementById("encBtn");
  if (btn) btn.disabled = true;

  const progressWrap = document.getElementById("encProgressWrap");
  const progressFill = document.getElementById("encProgressFill");
  const progressPct = document.getElementById("encProgressPct");
  const progressLabel = document.getElementById("encProgressLabel");

  if (progressWrap) progressWrap.classList.add("show");
  if (progressFill) progressFill.style.width = "0%";
  if (progressPct) progressPct.textContent = "0%";

  if (typeof window.pauseParticles === "function") window.pauseParticles(true);

  const startTime = performance.now();

  try {
    const ffmpeg = await loadFFmpeg();

    setStatus(document.getElementById("encStatus"), document.getElementById("encStatusText"), "working", "Reading video file...");

    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const inputName = "input." + ext;
    const outputName = "output.mp4";

    const fileBuffer = await file.arrayBuffer();
    ffmpeg.FS("writeFile", inputName, new Uint8Array(fileBuffer));

    setStatus(
      document.getElementById("encStatus"),
      document.getElementById("encStatusText"),
      "working",
      `Remuxing dengan ${ffmpeg._threads} thread...`
    );

    // REMUX — cuma copy stream + inject tag
    const args = [
      "-i", inputName,
      "-c", "copy",
      "-metadata", "copyright=ReyyTools",
      "-metadata", "encoded_by=Encoder by ReyyTools",
      "-movflags", "+faststart",
      outputName
    ];

    console.log("[Encoder] REMUX:", args.join(" "));
    await ffmpeg.run(...args);

    if (progressFill) progressFill.style.width = "90%";
    if (progressPct) progressPct.textContent = "90%";
    if (progressLabel) progressLabel.textContent = "Reading output...";

    const data = ffmpeg.FS("readFile", outputName);
    let outputBuffer = data.buffer;

    const blob = new Blob([outputBuffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    const a = document.createElement("a");
    a.href = url;
    a.download = `reyy-remuxed-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    if (progressFill) progressFill.style.width = "100%";
    if (progressPct) progressPct.textContent = "100%";

    setStatus(
      document.getElementById("encStatus"),
      document.getElementById("encStatusText"),
      "ok",
      `Remuxed dalam ${elapsed}s — ${formatBytes(blob.size)}`
    );

    showToast(`Remux selesai! ${elapsed}s`);

    try {
      ffmpeg.FS("unlink", inputName);
      ffmpeg.FS("unlink", outputName);
    } catch (e) {}

  } catch (err) {
    console.error("[Encoder] Error:", err);
    const msg = (err && err.message) ? err.message : "Cek Console F12";
    setStatus(document.getElementById("encStatus"), document.getElementById("encStatusText"), "error", msg);
    showToast("Gagal remux: " + msg);
  } finally {
    if (btn) btn.disabled = false;
    if (typeof window.pauseParticles === "function") window.pauseParticles(false);
    setTimeout(() => { if (progressWrap) progressWrap.classList.remove("show"); }, 3000);
  }
}