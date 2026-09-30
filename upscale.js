/* ═══════════════════════════════════════════════
   𝙧𝙚𝙮𝙮 𝙩𝙤𝙤𝙡𝙨 — AI Upscale Module
   Local image upscale (Canvas) + Cloud video upscale
   by.reyystecu
   ═══════════════════════════════════════════════ */

let upscaleFile = null;
let upscaleScale = 2;
let cloudVideoFile = null;

function initUpscale() {
  // Local image upload zone
  const localZone = document.querySelector("#upscale-local .upload-zone");
  if (localZone) {
    setupDropZone(localZone, (file) => {
      if (file.type.startsWith("image/")) {
        handleUpscaleFile({ target: { files: [file] } });
      } else {
        showToast("File harus gambar!");
      }
    });
  }

  // Cloud video upload zone
  const cloudZone = document.querySelector("#upscale-cloud .upload-zone");
  if (cloudZone) {
    setupDropZone(cloudZone, (file) => {
      if (file.type.startsWith("video/")) {
        handleCloudVideoFile({ target: { files: [file] } });
      } else {
        showToast("File harus video!");
      }
    });
  }
}

function setupDropZone(zone, onDrop) {
  ["dragenter", "dragover"].forEach(ev => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("drag");
    });
  });
  ["dragleave", "drop"].forEach(ev => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove("drag");
    });
  });
  zone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) onDrop(file);
  });
}

/* ═══════════════════════════════════════════════
   UPSCALE TAB SWITCH
   ═══════════════════════════════════════════════ */
function switchUpscaleTab(tab) {
  document.querySelectorAll(".upscale-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".upscale-content").forEach(c => c.classList.remove("active"));

  const tabBtn = document.querySelector(`.upscale-tab[data-tab="${tab}"]`);
  const content = document.getElementById("upscale-" + tab);
  if (tabBtn) tabBtn.classList.add("active");
  if (content) content.classList.add("active");
}

/* ═══════════════════════════════════════════════
   LOCAL IMAGE UPSCALE
   ═══════════════════════════════════════════════ */
function selectUpscaleScale(btn) {
  document.querySelectorAll("#upscale-local .timing-pill").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  upscaleScale = parseInt(btn.dataset.scale, 10) || 2;
}

function handleUpscaleFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("File harus gambar!");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast("Gambar max 20 MB");
    return;
  }

  upscaleFile = file;
  AppState.files.upscale = file;

  const nameEl = document.getElementById("upscaleFileName");
  if (nameEl) nameEl.textContent = `${file.name} (${formatBytes(file.size)})`;

  // Preview
  const preview = document.getElementById("upscalePreview");
  const placeholder = document.querySelector("#upscalePreviewBox .preview-placeholder");
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.onload = () => {
      preview.classList.add("loaded");
      if (placeholder) placeholder.style.display = "none";
    };
  }

  const btn = document.getElementById("upscaleBtn");
  if (btn) btn.disabled = false;

  setStatus(
    document.getElementById("upscaleStatus"),
    document.getElementById("upscaleStatusText"),
    "ok",
    "File siap di-upscale"
  );
}

async function runUpscale() {
  if (!upscaleFile) {
    showToast("Pilih gambar dulu!");
    return;
  }

  const btn = document.getElementById("upscaleBtn");
  if (btn) btn.disabled = true;

  const progressWrap = document.getElementById("upscaleProgressWrap");
  const progressFill = document.getElementById("upscaleProgressFill");
  const progressPct = document.getElementById("upscaleProgressPct");
  const progressLabel = document.getElementById("upscaleProgressLabel");

  if (progressWrap) progressWrap.classList.add("show");
  if (progressFill) progressFill.style.width = "10%";
  if (progressPct) progressPct.textContent = "10%";
  if (progressLabel) progressLabel.textContent = "Loading image...";

  setStatus(
    document.getElementById("upscaleStatus"),
    document.getElementById("upscaleStatusText"),
    "working",
    "Processing..."
  );

  const startTime = performance.now();

  try {
    // Load image
    const img = await loadImage(upscaleFile);

    if (progressFill) progressFill.style.width = "30%";
    if (progressPct) progressPct.textContent = "30%";
    if (progressLabel) progressLabel.textContent = "Upscaling...";

    // Upscale
    const targetW = img.width * upscaleScale;
    const targetH = img.height * upscaleScale;

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    // High-quality upscale
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetW, targetH);

    if (progressFill) progressFill.style.width = "60%";
    if (progressPct) progressPct.textContent = "60%";

    // Optional sharpening
    const sharpen = document.getElementById("upscaleSharpen");
    if (sharpen && sharpen.checked) {
      if (progressLabel) progressLabel.textContent = "Applying sharpening...";
      applySharpenFilter(canvas, 0.3);
    }

    if (progressFill) progressFill.style.width = "85%";
    if (progressPct) progressPct.textContent = "85%";
    if (progressLabel) progressLabel.textContent = "Encoding output...";

    // Get output format
    const format = document.getElementById("upscaleFormat").value || "image/png";

    const blob = await new Promise(resolve => canvas.toBlob(resolve, format, 0.95));

    if (progressFill) progressFill.style.width = "100%";
    if (progressPct) progressPct.textContent = "100%";

    const url = URL.createObjectURL(blob);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    // Download
    const ext = format === "image/png" ? "png" : format === "image/jpeg" ? "jpg" : "webp";
    const a = document.createElement("a");
    a.href = url;
    a.download = `reyy-upscaled-${upscaleScale}x-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    setStatus(
      document.getElementById("upscaleStatus"),
      document.getElementById("upscaleStatusText"),
      "ok",
      `Upscaled ${img.width}×${img.height} → ${targetW}×${targetH} (${elapsed}s)`
    );

    showToast(`Upscale berhasil! ${img.width}×${img.height} → ${targetW}×${targetH}`);

  } catch (err) {
    console.error(err);
    setStatus(
      document.getElementById("upscaleStatus"),
      document.getElementById("upscaleStatusText"),
      "error",
      err.message
    );
    showToast("Gagal upscale: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => {
      if (progressWrap) progressWrap.classList.remove("show");
    }, 3000);
  }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal load gambar"));
    img.src = URL.createObjectURL(file);
  });
}

/* ── Sharpen filter (unsharp mask lightweight) ── */
function applySharpenFilter(canvas, amount) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  const srcData = ctx.getImageData(0, 0, w, h);
  const src = srcData.data;
  const output = new Uint8ClampedArray(src.length);

  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;

      // Skip edge pixels
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        output[idx] = src[idx];
        output[idx + 1] = src[idx + 1];
        output[idx + 2] = src[idx + 2];
        output[idx + 3] = src[idx + 3];
        continue;
      }

      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let ki = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pIdx = ((y + ky) * w + (x + kx)) * 4 + c;
            sum += src[pIdx] * kernel[ki];
            ki++;
          }
        }
        // Blend original + sharpened
        const orig = src[idx + c];
        output[idx + c] = Math.max(0, Math.min(255, orig * (1 - amount) + sum * amount));
      }
      output[idx + 3] = src[idx + 3];
    }
  }

  ctx.putImageData(new ImageData(output, w, h), 0, 0);
}

/* ═══════════════════════════════════════════════
   CLOUD VIDEO UPSCALE
   ═══════════════════════════════════════════════ */
function handleCloudVideoFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("video/")) {
    showToast("File harus video!");
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    showToast("Video max 100 MB untuk cloud");
    return;
  }

  cloudVideoFile = file;
  AppState.files.cloudVideo = file;

  const nameEl = document.getElementById("cloudVideoFileName");
  if (nameEl) nameEl.textContent = `${file.name} (${formatBytes(file.size)})`;

  // Preview
  const preview = document.getElementById("cloudVideoPreview");
  const placeholder = document.querySelector("#cloudVideoPreviewBox .preview-placeholder");
  if (preview) {
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.onloadedmetadata = () => {
      preview.classList.add("loaded");
      if (placeholder) placeholder.style.display = "none";
    };
  }

  const btn = document.getElementById("cloudBtn");
  if (btn) btn.disabled = false;

  setStatus(
    document.getElementById("cloudStatus"),
    document.getElementById("cloudStatusText"),
    "ok",
    "File siap di-upload"
  );
}

async function runCloudUpscale() {
  const apiUrl = document.getElementById("cloudApiUrl").value.trim();

  if (!apiUrl) {
    showToast("Isi API endpoint URL dulu");
    return;
  }

  if (!cloudVideoFile) {
    showToast("Pilih video dulu!");
    return;
  }

  const btn = document.getElementById("cloudBtn");
  if (btn) btn.disabled = true;

  const progressWrap = document.getElementById("cloudProgressWrap");
  const progressFill = document.getElementById("cloudProgressFill");
  const progressPct = document.getElementById("cloudProgressPct");
  const progressLabel = document.getElementById("cloudProgressLabel");

  if (progressWrap) progressWrap.classList.add("show");
  if (progressFill) progressFill.style.width = "5%";
  if (progressPct) progressPct.textContent = "5%";
  if (progressLabel) progressLabel.textContent = "Uploading video...";

  setStatus(
    document.getElementById("cloudStatus"),
    document.getElementById("cloudStatusText"),
    "working",
    "Uploading to server..."
  );

  try {
    const targetRes = document.getElementById("cloudTargetRes").value || "2";

    const formData = new FormData();
    formData.append("video", cloudVideoFile);
    formData.append("scale", targetRes);

    // Use XHR for progress
    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", apiUrl, true);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = (e.loaded / e.total) * 50; // 0-50% for upload
          if (progressFill) progressFill.style.width = pct + "%";
          if (progressPct) progressPct.textContent = Math.round(pct) + "%";
        }
      };

      xhr.upload.onload = () => {
        if (progressLabel) progressLabel.textContent = "Server processing...";
        if (progressFill) progressFill.style.width = "60%";
        if (progressPct) progressPct.textContent = "60%";
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Server error: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error — pastikan URL valid & server aktif"));
      xhr.responseType = "blob";
      xhr.send(formData);
    });

    if (progressFill) progressFill.style.width = "95%";
    if (progressPct) progressPct.textContent = "95%";

    const blob = new Blob([result], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    if (progressFill) progressFill.style.width = "100%";
    if (progressPct) progressPct.textContent = "100%";

    const a = document.createElement("a");
    a.href = url;
    a.download = `reyy-cloud-upscaled-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    setStatus(
      document.getElementById("cloudStatus"),
      document.getElementById("cloudStatusText"),
      "ok",
      `Cloud upscale selesai (${formatBytes(blob.size)})`
    );

    showToast("Cloud upscale berhasil!");

  } catch (err) {
    console.error(err);
    setStatus(
      document.getElementById("cloudStatus"),
      document.getElementById("cloudStatusText"),
      "error",
      err.message
    );
    showToast("Gagal cloud upscale: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    setTimeout(() => {
      if (progressWrap) progressWrap.classList.remove("show");
    }, 3000);
  }
}