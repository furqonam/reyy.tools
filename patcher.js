/* ═══════════════════════════════════════════════
   𝙧𝙚𝙮𝙮 𝙩𝙤𝙤𝙡𝙨 — SmartPatch Engine v14 FINAL
   + Z-Payload + MTLib Atom + Encoder Str + Remux
   by.reyystecu
   ═══════════════════════════════════════════════ */

let patchMode = "smart";
let patchTiming = 2;

function initPatcher() {
  const zone = document.getElementById("patchUpload");
  if (!zone) return;
  if (zone._patcherBound) return;
  zone._patcherBound = true;

  ["dragenter", "dragover"].forEach(ev => {
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); });
  });
  ["dragleave", "drop"].forEach(ev => {
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); });
  });
  zone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type === "video/mp4") {
      handlePatchFile({ target: { files: [file] } });
    } else {
      showToast("File harus MP4!");
    }
  });
}

function selectPatchMode(mode) {
  patchMode = mode;
  document.querySelectorAll("#tool-patcher .mode-card").forEach(c => c.classList.remove("active"));
  const el = document.querySelector(`#tool-patcher .mode-card[data-mode="${mode}"]`);
  if (el) el.classList.add("active");
  const timingPanel = document.getElementById("timingPanel");
  if (timingPanel) timingPanel.classList.toggle("show", mode === "its");
}

function selectTiming(btn) {
  document.querySelectorAll("#tool-patcher .timing-pill").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  patchTiming = parseInt(btn.dataset.scale, 10) || 2;
}

function handlePatchFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.includes("mp4")) { showToast("File harus MP4!"); return; }
  if (file.size > 500 * 1024 * 1024) { showToast("File terlalu besar (max 500 MB)"); return; }

  AppState.files.patch = file;
  window._reyyPatchFile = file;
  window._reyyEncodedFile = null;

  console.log('[SmartPatch] File baru:', file.name);

  const nameEl = document.getElementById("patchFileName");
  if (nameEl) nameEl.textContent = `${file.name} (${formatBytes(file.size)})`;

  const preview = document.getElementById("patchPreview");
  const placeholder = document.getElementById("patchPreviewPlaceholder");
  if (preview && placeholder) {
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.onloadedmetadata = () => {
      preview.classList.add("loaded");
      placeholder.style.display = "none";
    };
  }

  const btn = document.getElementById("patchBtn");
  if (btn) btn.disabled = false;

  const resultCard = document.getElementById("patchResultCard");
  if (resultCard) resultCard.classList.remove("show");

  setStatus(
    document.getElementById("patchStatus"),
    document.getElementById("patchStatusText"),
    "ok",
    "File siap di-patch"
  );
}

/* ═══════════════════════════════════════════════
   MP4 BOX PARSER
   ═══════════════════════════════════════════════ */

const CONTAINER_BOXES = ["moov", "trak", "mdia", "minf", "stbl", "edts", "mvex", "moof", "traf", "udta", "meta", "ilst"];

function readBoxType(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset + 4), view.getUint8(offset + 5),
    view.getUint8(offset + 6), view.getUint8(offset + 7)
  );
}

function walkBoxes(view, start, end, callback) {
  let pos = start;
  while (pos < end - 8) {
    let size = view.getUint32(pos);
    const type = readBoxType(view, pos);
    let headerSize = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(pos + 8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize) break;

    const contentStart = pos + headerSize;
    const contentEnd = pos + size;
    if (contentEnd > end) break;

    const stop = callback({ type, offset: pos, size, headerSize, contentStart, contentEnd });
    if (stop === true) return true;

    if (type === "meta") {
      const childStart = contentStart + 4;
      if (childStart < contentEnd - 8) {
        if (walkBoxes(view, childStart, contentEnd, callback)) return true;
      }
    } else if (CONTAINER_BOXES.includes(type)) {
      if (walkBoxes(view, contentStart, contentEnd, callback)) return true;
    } else if (["avc1", "hvc1", "hev1", "mp4v"].includes(type)) {
      const childStart = contentStart + 78;
      if (childStart < contentEnd - 8) {
        if (walkBoxes(view, childStart, contentEnd, callback)) return true;
      }
    }
    pos += size;
  }
  return false;
}

function readTkhdDimensions(view, box) {
  const version = view.getUint8(box.contentStart);
  let wOff, hOff;
  if (version === 1) { wOff = box.contentStart + 88; hOff = box.contentStart + 92; }
  else { wOff = box.contentStart + 76; hOff = box.contentStart + 80; }
  if (hOff + 4 > box.contentEnd) return { w: 0, h: 0 };
  return { w: view.getUint32(wOff) >>> 16, h: view.getUint32(hOff) >>> 16 };
}

/* ═══════════════════════════════════════════════
   PATCH FUNCTIONS
   ═══════════════════════════════════════════════ */

function patchTkhd(view, box, targetW, targetH) {
  const version = view.getUint8(box.contentStart);
  let wOff, hOff;
  if (version === 1) { wOff = box.contentStart + 88; hOff = box.contentStart + 92; }
  else { wOff = box.contentStart + 76; hOff = box.contentStart + 80; }
  if (hOff + 4 > box.contentEnd) return false;
  view.setUint32(wOff, targetW << 16);
  view.setUint32(hOff, targetH << 16);
  return true;
}

function patchStsd(view, box, targetW, targetH) {
  const entryCount = view.getUint32(box.contentStart + 4);
  if (entryCount === 0) return false;
  const entryStart = box.contentStart + 8;
  const wOff = entryStart + 32;
  const hOff = entryStart + 34;
  if (hOff + 2 > box.contentEnd) return false;
  view.setUint16(wOff, targetW);
  view.setUint16(hOff, targetH);
  return true;
}

function patchBtrt(view, box, maxBitrate, avgBitrate) {
  if (box.size < 20) return false;
  const bufferSizeOff = box.contentStart;
  const maxBitrateOff = box.contentStart + 4;
  const avgBitrateOff = box.contentStart + 8;
  if (avgBitrateOff + 4 > box.contentEnd) return false;
  view.setUint32(bufferSizeOff, 10000000);
  view.setUint32(maxBitrateOff, maxBitrate);
  view.setUint32(avgBitrateOff, avgBitrate);
  return true;
}

function patchEsds(view, box, audioBitrate) {
  try {
    const start = box.contentStart;
    const end = box.contentEnd;
    for (let i = end - 12; i > start && i > end - 100; i--) {
      const val = view.getUint32(i);
      if (val >= 50000 && val <= 500000) {
        view.setUint32(i, audioBitrate);
        if (i + 4 < end) view.setUint32(i + 4, audioBitrate);
        return true;
      }
    }
  } catch (e) {}
  return false;
}

function patchMdhd(view, box, targetTimescale) {
  const version = view.getUint8(box.contentStart);
  const tsOff = version === 1 ? box.contentStart + 20 : box.contentStart + 12;
  if (tsOff + 4 > box.contentEnd) return false;
  view.setUint32(tsOff, targetTimescale);
  return true;
}

function patchMvhd(view, box, targetTimescale) {
  const version = view.getUint8(box.contentStart);
  const tsOff = version === 1 ? box.contentStart + 20 : box.contentStart + 12;
  if (tsOff + 4 > box.contentEnd) return false;
  view.setUint32(tsOff, targetTimescale);
  return true;
}

/* ═══════════════════════════════════════════════
   METADATA STAMP — Z-Payload + MTLib + Encoder Str
   ═══════════════════════════════════════════════ */

function findRawAtomOffset(data, atomType) {
  const enc = new TextEncoder();
  const typeBytes = enc.encode(atomType);
  for (let i = 0; i <= data.length - 8; i++) {
    if (data[i + 4] === typeBytes[0] && data[i + 5] === typeBytes[1] &&
        data[i + 6] === typeBytes[2] && data[i + 7] === typeBytes[3]) {
      const size = (data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3];
      if (size > 8 && i + size <= data.length) return i;
    }
  }
  return -1;
}

function patchZPayload(data) {
  const mdatIdx = findRawAtomOffset(data, 'mdat');
  if (mdatIdx === -1) throw new Error('Struktur video tidak valid.');
  const zt = mdatIdx + 10;
  for (let i = 0; i < 128; i++) { if (zt + i < data.length) data[zt + i] = 0x5A; }
  return true;
}

function patchEncoderStr(data) {
  const enc = new TextEncoder();
  const lavf = enc.encode('Lavf');
  const target = enc.encode('Lavf59.16.100');
  for (let i = 0; i <= data.length - 16; i++) {
    if (data[i] === lavf[0] && data[i + 1] === lavf[1] && data[i + 2] === lavf[2] && data[i + 3] === lavf[3]) {
      if (data[i + 4] >= 0x30 && data[i + 4] <= 0x39) {
        let end = i + 4;
        while (end < data.length && data[end] >= 0x20 && data[end] < 0x7F) end++;
        const ol = end - i;
        for (let j = 0; j < ol; j++) data[i + j] = j < target.length ? target[j] : 0x00;
        return true;
      }
    }
  }
  return false;
}

function injectMTLib(origBuffer) {
  const enc = new TextEncoder();
  const origData = new Uint8Array(origBuffer);
  const origView = new DataView(origBuffer);

  const domain = enc.encode('com.apple.quicktime');
  const keyBytes = enc.encode('MTLib');
  const valBytes = enc.encode('PyPVGCodec');

  const meanBox = new Uint8Array(4 + 4 + 4 + domain.length);
  new DataView(meanBox.buffer).setUint32(0, meanBox.length, false);
  meanBox.set(enc.encode('mean'), 4); meanBox.set(domain, 12);

  const nameBox = new Uint8Array(4 + 4 + 4 + keyBytes.length);
  new DataView(nameBox.buffer).setUint32(0, nameBox.length, false);
  nameBox.set(enc.encode('name'), 4); nameBox.set(keyBytes, 12);

  const dataBox = new Uint8Array(4 + 4 + 4 + valBytes.length);
  const dataView = new DataView(dataBox.buffer);
  dataView.setUint32(0, dataBox.length, false); dataBox.set(enc.encode('data'), 4);
  dataView.setUint32(8, 1, false); dataBox.set(valBytes, 12);

  const freeformSize = 4 + 4 + meanBox.length + nameBox.length + dataBox.length;
  const freeform = new Uint8Array(freeformSize);
  const ffView = new DataView(freeform.buffer);
  ffView.setUint32(0, freeformSize, false); freeform.set(enc.encode('----'), 4);
  let pos = 8;
  freeform.set(meanBox, pos); pos += meanBox.length;
  freeform.set(nameBox, pos); pos += nameBox.length;
  freeform.set(dataBox, pos);

  let moovPos = -1, moovSz = 0;
  pos = 0;
  while (pos + 8 <= origData.length) {
    const sz = origView.getUint32(pos, false);
    const t = String.fromCharCode(origData[pos + 4], origData[pos + 5], origData[pos + 6], origData[pos + 7]);
    if (t === 'moov') { moovPos = pos; moovSz = sz; break; }
    if (sz < 8) break;
    pos += sz;
  }
  if (moovPos === -1) return { buffer: origBuffer, injected: false };

  let udtaPos = -1, udtaSz = 0;
  pos = moovPos + 8;
  const moovEnd = moovPos + moovSz;
  while (pos + 8 <= moovEnd) {
    const sz = origView.getUint32(pos, false);
    const t = String.fromCharCode(origData[pos + 4], origData[pos + 5], origData[pos + 6], origData[pos + 7]);
    if (t === 'udta') { udtaPos = pos; udtaSz = sz; break; }
    if (sz < 8) break;
    pos += sz;
  }

  let newBuf;
  if (udtaPos !== -1) {
    const insertAt = udtaPos + udtaSz;
    newBuf = new ArrayBuffer(origData.length + freeform.length);
    const nd = new Uint8Array(newBuf); const nv = new DataView(newBuf);
    nd.set(origData.subarray(0, insertAt)); nd.set(freeform, insertAt);
    nd.set(origData.subarray(insertAt), insertAt + freeform.length);
    nv.setUint32(moovPos, moovSz + freeform.length, false);
    nv.setUint32(udtaPos, udtaSz + freeform.length, false);
  } else {
    const udtaNew = new Uint8Array(8 + freeform.length);
    new DataView(udtaNew.buffer).setUint32(0, udtaNew.length, false);
    udtaNew.set(enc.encode('udta'), 4); udtaNew.set(freeform, 8);
    const insertAt = moovEnd;
    newBuf = new ArrayBuffer(origData.length + udtaNew.length);
    const nd = new Uint8Array(newBuf); const nv = new DataView(newBuf);
    nd.set(origData.subarray(0, insertAt)); nd.set(udtaNew, insertAt);
    nd.set(origData.subarray(insertAt), insertAt + udtaNew.length);
    nv.setUint32(moovPos, moovSz + udtaNew.length, false);
  }
  return { buffer: newBuf, injected: true };
}

function applyMetadataStamp(arrayBuffer) {
  let buf = arrayBuffer;
  try {
    const firstPass = new Uint8Array(buf);
    patchZPayload(firstPass);
    console.log('[SmartPatch] Z-Payload applied');
  } catch (e) { console.warn('Z-Payload failed:', e.message); }
  try {
    const mt = injectMTLib(buf);
    if (mt.injected) { buf = mt.buffer; console.log('[SmartPatch] MTLib injected'); }
  } catch (e) { console.warn('MTLib failed:', e.message); }
  try {
    patchEncoderStr(new Uint8Array(buf));
    console.log('[SmartPatch] Encoder string patched');
  } catch (e) { console.warn('Encoder str failed:', e.message); }
  return buf;
}

/* ═══════════════════════════════════════════════
   PATCH APPLIER
   ═══════════════════════════════════════════════ */

function applyPatchToBuffer(buffer) {
  const view = new DataView(buffer);
  if (readBoxType(view, 0) !== "ftyp") throw new Error("Bukan file MP4 yang valid");

  const targetRes = parseInt(document.getElementById("patchRes").value, 10) || 1080;
  let targetW, targetH;

  if (patchMode === "force") {
    targetW = targetRes;
    targetH = Math.round(targetRes * 16 / 9);
  } else {
    let detectedW = 1080, detectedH = 1920;
    walkBoxes(view, 0, buffer.byteLength, (box) => {
      if (box.type === "tkhd") {
        const dims = readTkhdDimensions(view, box);
        if (dims.w && dims.h) { detectedW = dims.w; detectedH = dims.h; }
        return true;
      }
    });
    console.log('[SmartPatch] Detected:', detectedW + 'x' + detectedH);
    if (detectedH > detectedW) { targetW = targetRes; targetH = Math.round(targetRes * 16 / 9); }
    else { targetH = targetRes; targetW = Math.round(targetRes * 16 / 9); }
  }
  console.log('[SmartPatch] Target:', targetW + 'x' + targetH);

  const MAX_BITRATE = 25000000;
  const AVG_BITRATE = 20000000;
  const AUDIO_BITRATE = 192000;

  let patchCount = 0;
  walkBoxes(view, 0, buffer.byteLength, (box) => {
    if (box.type === "tkhd") { if (patchTkhd(view, box, targetW, targetH)) patchCount++; }
    else if (box.type === "stsd" && box.size >= 100) { if (patchStsd(view, box, targetW, targetH)) patchCount++; }
    else if (box.type === "btrt") { if (patchBtrt(view, box, MAX_BITRATE, AVG_BITRATE)) patchCount++; }
    else if (box.type === "esds") { if (patchEsds(view, box, AUDIO_BITRATE)) patchCount++; }
    else if (box.type === "mdhd" && patchMode === "its") { if (patchMdhd(view, box, 60000 * patchTiming)) patchCount++; }
    else if (box.type === "mvhd" && patchMode === "its") { if (patchMvhd(view, box, 60000 * patchTiming)) patchCount++; }
  });

  if (patchCount === 0) throw new Error("Tidak ada box yang bisa di-patch");
  return { buffer, targetW, targetH, patchCount };
}

/* ═══════════════════════════════════════════════
   MAIN PATCH RUNNER
   ═══════════════════════════════════════════════ */

async function runSmartPatch() {
  let file = AppState.files.patch;
  if (!file && window._reyyPatchFile) { file = window._reyyPatchFile; AppState.files.patch = file; }
  if (!file) { showToast("Pilih file dulu!"); return; }

  const executionEl = document.getElementById("patchExecution");
  const execution = executionEl ? executionEl.value : "patch_only";

  const btn = document.getElementById("patchBtn");
  if (btn) btn.disabled = true;

  const resultCard = document.getElementById("patchResultCard");
  if (resultCard) resultCard.classList.remove("show");

  const progressWrap = document.getElementById("patchProgressWrap");
  const progressFill = document.getElementById("patchProgressFill");
  const progressPct = document.getElementById("patchProgressPct");
  const progressLabel = document.getElementById("patchProgressLabel");

  if (progressWrap) progressWrap.classList.add("show");
  if (progressFill) progressFill.style.width = "10%";
  if (progressPct) progressPct.textContent = "10%";

  if (typeof window.pauseParticles === "function") window.pauseParticles(true);

  const startTime = performance.now();

  try {
    let outputBuffer;

    // ═══ MODE: PATCH ONLY ═══
    if (execution === "patch_only") {
      if (progressLabel) progressLabel.textContent = "Reading MP4 structure...";
      setStatus(document.getElementById("patchStatus"), document.getElementById("patchStatusText"), "working", "Reading MP4...");

      outputBuffer = await file.arrayBuffer();
      if (progressFill) progressFill.style.width = "30%";
      if (progressPct) progressPct.textContent = "30%";

      outputBuffer = applyMetadataStamp(outputBuffer);

      if (progressFill) progressFill.style.width = "60%";
      if (progressPct) progressPct.textContent = "60%";

      const res = applyPatchToBuffer(outputBuffer);
      outputBuffer = res.buffer;
      console.log(`[SmartPatch] Patched ${res.patchCount} boxes → ${res.targetW}×${res.targetH}`);
    }
    // ═══ MODE: ENCODE + PATCH (REMUX) ═══
    else if (execution === "encode_patch") {
      if (progressLabel) progressLabel.textContent = "Loading FFmpeg engine...";
      setStatus(document.getElementById("patchStatus"), document.getElementById("patchStatusText"), "working", "Loading FFmpeg...");

      if (typeof loadFFmpeg !== "function") throw new Error("FFmpeg engine tidak tersedia");
      const ffmpeg = await loadFFmpeg();

      if (progressLabel) progressLabel.textContent = "Reading video...";
      if (progressFill) progressFill.style.width = "20%";
      if (progressPct) progressPct.textContent = "20%";

      const { fetchFile } = await import("https://esm.sh/@ffmpeg/util@0.12.1");
      const inputName = "patch_input." + (file.name.split(".").pop() || "mp4");
      const outputName = "patch_output.mp4";

      await ffmpeg.writeFile(inputName, await fetchFile(file));

      if (progressLabel) progressLabel.textContent = "Remuxing (copy stream)...";
      if (progressFill) progressFill.style.width = "40%";
      if (progressPct) progressPct.textContent = "40%";
      setStatus(document.getElementById("patchStatus"), document.getElementById("patchStatusText"), "working", "Remuxing...");

      await ffmpeg.exec([
        "-i", inputName,
        "-c", "copy",
        "-metadata", "copyright=ReyyTools",
        "-metadata", "encoded_by=Encoder by ReyyTools",
        "-movflags", "+faststart",
        outputName
      ]);

      if (progressFill) progressFill.style.width = "70%";
      if (progressPct) progressPct.textContent = "70%";

      const data = await ffmpeg.readFile(outputName);
      outputBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

      try {
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
      } catch (e) {}

      if (progressLabel) progressLabel.textContent = "Applying metadata stamp...";
      if (progressFill) progressFill.style.width = "80%";
      if (progressPct) progressPct.textContent = "80%";

      outputBuffer = applyMetadataStamp(outputBuffer);

      const res = applyPatchToBuffer(outputBuffer);
      outputBuffer = res.buffer;
      console.log(`[Encode+Patch] Patched ${res.patchCount} boxes`);
    }

    if (progressFill) progressFill.style.width = "95%";
    if (progressPct) progressPct.textContent = "95%";

    const blob = new Blob([outputBuffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    const a = document.createElement("a");
    a.href = url;
    const suffix = execution === "encode_patch" ? "remux-patched" : "patched";
    a.download = `reyy-${suffix}-${Date.now()}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    const resFileName = document.getElementById("resFileName");
    const resTime = document.getElementById("resTime");
    const resBefore = document.getElementById("resBefore");
    const resAfter = document.getElementById("resAfter");
    if (resFileName) resFileName.textContent = file.name;
    if (resTime) resTime.textContent = elapsed + "s";
    if (resBefore) resBefore.textContent = formatBytes(file.size);
    if (resAfter) resAfter.textContent = formatBytes(blob.size);
    if (resultCard) resultCard.classList.add("show");

    if (progressFill) progressFill.style.width = "100%";
    if (progressPct) progressPct.textContent = "100%";

    const modeText = execution === "encode_patch" ? "Remux+Patch" : "Patch Only";
    setStatus(document.getElementById("patchStatus"), document.getElementById("patchStatusText"), "ok", `${modeText} selesai (${elapsed}s)`);
    showToast(`${modeText} berhasil! ${elapsed}s`);

  } catch (err) {
    console.error(err);
    setStatus(document.getElementById("patchStatus"), document.getElementById("patchStatusText"), "error", err.message);
    showToast("Gagal: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (typeof window.pauseParticles === "function") window.pauseParticles(false);
    setTimeout(() => { if (progressWrap) progressWrap.classList.remove("show"); }, 3000);
  }
}