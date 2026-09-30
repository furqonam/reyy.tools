/* ═══════════════════════════════════════════════
   𝙧𝙚𝙮𝙮 𝙩𝙤𝙤𝙡𝙨 — SmartPatch Engine v15 FINAL
   Shark Sample Table Method + MTLib + Z-Payload
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
   LOW-LEVEL HELPERS — MP4 Byte Manipulation
   ═══════════════════════════════════════════════ */

function concatBytes(arrays) {
  let total = 0;
  arrays.forEach(a => total += a.length);
  const out = new Uint8Array(total);
  let off = 0;
  arrays.forEach(a => { out.set(a, off); off += a.length; });
  return out;
}

function makeBox(type, payload) {
  const box = new Uint8Array(8 + payload.length);
  const view = new DataView(box.buffer);
  view.setUint32(0, box.length, false);
  for (let i = 0; i < 4; i++) box[4 + i] = type.charCodeAt(i);
  box.set(payload, 8);
  return box;
}

function boxBytes(box) {
  return concatBytes([box.data.slice(box.start, box.end)]);
}

function boxPayload(box) {
  return box.data.slice(box.contentStart, box.end);
}

function assertUint32(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
    throw new Error(`${name} di luar jangkauan uint32: ${value}`);
  }
}

/* ═══════════════════════════════════════════════
   BOX PARSER
   ═══════════════════════════════════════════════ */

const CONTAINER_BOXES = ["moov", "trak", "mdia", "minf", "stbl", "edts", "mvex", "moof", "traf", "udta"];

function parseBoxes(data, view, start, end) {
  const boxes = [];
  let pos = start;
  while (pos + 8 <= end) {
    let size = view.getUint32(pos, false);
    const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
    let headerSize = 8;

    if (size === 1) {
      size = Number(view.getBigUint64(pos + 8, false));
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize) break;
    const contentStart = pos + headerSize;
    const boxEnd = pos + size;
    if (boxEnd > end) break;

    const box = { type, start: pos, end: boxEnd, contentStart, size, headerSize, data, view, prefixStart: pos + 8, prefixEnd: contentStart, children: [] };

    if (CONTAINER_BOXES.includes(type)) {
      box.children = parseBoxes(data, view, contentStart, boxEnd);
    } else if (["avc1", "hvc1", "hev1", "mp4v"].includes(type)) {
      box.children = parseBoxes(data, view, contentStart + 78, boxEnd);
    } else if (type === "meta") {
      box.children = parseBoxes(data, view, contentStart + 4, boxEnd);
    }
    boxes.push(box);
    pos = boxEnd;
  }
  return boxes;
}

function findTopLevel(boxes, type) {
  return boxes.find(b => b.type === type);
}

function findChild(box, type) {
  return box.children.find(c => c.type === type);
}

function findDescendant(box, path) {
  let cur = box;
  for (const type of path) {
    cur = cur.children.find(c => c.type === type);
    if (!cur) return null;
  }
  return cur;
}

function handlerTypeForTrak(trak) {
  const hdlr = findDescendant(trak, ['mdia', 'hdlr']);
  if (!hdlr) return null;
  return String.fromCharCode(
    hdlr.data[hdlr.contentStart + 8],
    hdlr.data[hdlr.contentStart + 9],
    hdlr.data[hdlr.contentStart + 10],
    hdlr.data[hdlr.contentStart + 11]
  );
}

/* ═══════════════════════════════════════════════
   TABLE PARSERS
   ═══════════════════════════════════════════════ */

function parseStsz(stsz) {
  const view = new DataView(stsz.data.buffer);
  const sampleSize = view.getUint32(stsz.contentStart + 4, false);
  const count = view.getUint32(stsz.contentStart + 8, false);
  if (sampleSize !== 0) {
    return new Array(count).fill(sampleSize);
  }
  const sizes = [];
  for (let i = 0; i < count; i++) {
    sizes.push(view.getUint32(stsz.contentStart + 12 + i * 4, false));
  }
  return sizes;
}

function parseStsc(stsc) {
  const view = new DataView(stsc.data.buffer);
  const count = view.getUint32(stsc.contentStart + 4, false);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const off = stsc.contentStart + 8 + i * 12;
    rows.push([
      view.getUint32(off, false),
      view.getUint32(off + 4, false),
      view.getUint32(off + 8, false)
    ]);
  }
  return rows;
}

function parseStco(stco) {
  const view = new DataView(stco.data.buffer);
  const count = view.getUint32(stco.contentStart + 4, false);
  const offsets = [];
  for (let i = 0; i < count; i++) {
    offsets.push(view.getUint32(stco.contentStart + 8 + i * 4, false));
  }
  return offsets;
}

/* ═══════════════════════════════════════════════
   TABLE BUILDERS
   ═══════════════════════════════════════════════ */

const SHARK = {
  VIDEO_TIMESCALE: 90000,
  VIDEO_DURATION: 2269500,
  VIDEO_EDIT_MEDIA_TIME: 3000,
  VIDEO_SAMPLE_DELTA: 1500,
  FAKE_SAMPLE_SIZE: 8,
  FAKE_SAMPLE_BYTES: new Uint8Array([0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00])
};

function buildMdhd(box) {
  const payload = new Uint8Array(boxPayload(box));
  const view = new DataView(payload.buffer);
  if (payload[0] !== 0) throw new Error(`Versi mdhd tidak didukung: ${payload[0]}.`);
  view.setUint32(12, SHARK.VIDEO_TIMESCALE, false);
  view.setUint32(16, SHARK.VIDEO_DURATION, false);
  return makeBox('mdhd', payload);
}

function buildElst(box) {
  const payload = new Uint8Array(boxPayload(box));
  const view = new DataView(payload.buffer);
  const ver = payload[0];
  const ec = view.getUint32(4, false);
  if (ver !== 0 || ec < 1) throw new Error('elst butuh version 0 dengan minimal 1 entry.');
  view.setUint32(12, SHARK.VIDEO_EDIT_MEDIA_TIME, false);
  return makeBox('elst', payload);
}

function buildStts(realSampleCount, fakeSampleCount) {
  const payload = new Uint8Array(4 + 4 + 8 + 8);
  const view = new DataView(payload.buffer);
  view.setUint32(4, 2, false);
  view.setUint32(8, realSampleCount, false);
  view.setUint32(12, SHARK.VIDEO_SAMPLE_DELTA, false);
  view.setUint32(16, fakeSampleCount, false);
  view.setUint32(20, SHARK.VIDEO_SAMPLE_DELTA, false);
  return makeBox('stts', payload);
}

function buildStsz(originalSizes, fakeSampleCount) {
  const total = originalSizes.length + fakeSampleCount;
  const payload = new Uint8Array(4 + 4 + 4 + total * 4);
  const view = new DataView(payload.buffer);
  view.setUint32(8, total, false);
  let offset = 12;
  originalSizes.forEach(s => { view.setUint32(offset, s, false); offset += 4; });
  for (let i = 0; i < fakeSampleCount; i++) {
    view.setUint32(offset, SHARK.FAKE_SAMPLE_SIZE, false);
    offset += 4;
  }
  return makeBox('stsz', payload);
}

function buildStsc(originalRows, originalChunkCount) {
  const rows = originalRows.map(r => [...r]);
  const last = rows[rows.length - 1];
  if (!last || last[1] !== 1) rows.push([originalChunkCount + 1, 1, 1]);
  const payload = new Uint8Array(4 + 4 + rows.length * 12);
  const view = new DataView(payload.buffer);
  view.setUint32(4, rows.length, false);
  let offset = 8;
  rows.forEach(([fc, spc, sdi]) => {
    view.setUint32(offset, fc, false);
    view.setUint32(offset + 4, spc, false);
    view.setUint32(offset + 8, sdi, false);
    offset += 12;
  });
  return makeBox('stsc', payload);
}

function buildStco(originalOffsets, delta, fakeOffset = null, fakeSampleCount = 0) {
  const count = originalOffsets.length + (fakeOffset === null ? 0 : fakeSampleCount);
  const payload = new Uint8Array(4 + 4 + count * 4);
  const view = new DataView(payload.buffer);
  view.setUint32(4, count, false);
  let tableOffset = 8;
  originalOffsets.forEach(off => {
    const shifted = off + delta;
    assertUint32(shifted, 'stco.chunk_offset');
    view.setUint32(tableOffset, shifted, false);
    tableOffset += 4;
  });
  if (fakeOffset !== null) {
    assertUint32(fakeOffset, 'stco.fake_sample_offset');
    for (let i = 0; i < fakeSampleCount; i++) {
      view.setUint32(tableOffset, fakeOffset, false);
      tableOffset += 4;
    }
  }
  return makeBox('stco', payload);
}

function rebuildBox(box, replacements) {
  if (replacements.has(box)) return replacements.get(box);
  if (!box.children.length) return boxBytes(box);
  const parts = [box.data.slice(box.prefixStart, box.prefixEnd)];
  box.children.forEach(child => parts.push(rebuildBox(child, replacements)));
  return makeBox(box.type, concatBytes(parts));
}

function collectTrackStcoBoxes(moov) {
  const stcoBoxes = [];
  moov.children.filter(c => c.type === 'trak').forEach(trak => {
    const stbl = findDescendant(trak, ['mdia', 'minf', 'stbl']);
    if (!stbl) return;
    const co64 = findChild(stbl, 'co64');
    if (co64) throw new Error('MP4 dengan co64 tidak didukung.');
    const stco = findChild(stbl, 'stco');
    if (stco) stcoBoxes.push(stco);
  });
  return stcoBoxes;
}

function buildStcoReplacements(stcoBoxes, videoStco, delta, fakeOffset, fakeSampleCount) {
  const replacements = new Map();
  stcoBoxes.forEach(stco => {
    replacements.set(stco, buildStco(
      parseStco(stco), delta,
      stco === videoStco ? fakeOffset : null,
      fakeSampleCount
    ));
  });
  return replacements;
}

/* ═══════════════════════════════════════════════
   MAIN — SHARK SAMPLE TABLE PATCH
   ═══════════════════════════════════════════════ */

function patchSharkSampleTableMethod(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const topLevel = parseBoxes(data, view, 0, data.length);

  const ftyp = findTopLevel(topLevel, 'ftyp');
  const moov = findTopLevel(topLevel, 'moov');
  const mdat = findTopLevel(topLevel, 'mdat');

  if (!ftyp) throw new Error('"ftyp" box tidak ditemukan.');
  if (!moov) throw new Error('"moov" box tidak ditemukan.');
  if (!mdat) throw new Error('"mdat" box tidak ditemukan.');

  // Cari track video
  const videoTrak = moov.children.find(c =>
    c.type === 'trak' && handlerTypeForTrak(c) === 'vide'
  );
  if (!videoTrak) throw new Error('Track video tidak ditemukan.');

  const stbl = findDescendant(videoTrak, ['mdia', 'minf', 'stbl']);
  const mdhd = findDescendant(videoTrak, ['mdia', 'mdhd']);
  const elst = findDescendant(videoTrak, ['edts', 'elst']);
  const stts = stbl && findChild(stbl, 'stts');
  const stsc = stbl && findChild(stbl, 'stsc');
  const stsz = stbl && findChild(stbl, 'stsz');
  const stco = stbl && findChild(stbl, 'stco');

  if (!stbl || !mdhd || !elst || !stts || !stsc || !stsz || !stco) {
    throw new Error('MP4 kurang tabel: mdhd, elst, stts, stsc, stsz, stco wajib ada.');
  }

  const originalSizes = parseStsz(stsz);
  const originalStscRows = parseStsc(stsc);
  const originalChunkOffsets = parseStco(stco);
  const stcoBoxes = collectTrackStcoBoxes(moov);

  const preservedTopLevel = topLevel
    .filter(b => !['ftyp', 'moov', 'mdat'].includes(b.type))
    .map(boxBytes);

  // Fake sample count = 9x real sample (kayak Kythera)
  const fakeSampleCount = originalSizes.length * 9;

  const fixedReplacements = new Map([
    [mdhd, buildMdhd(mdhd)],
    [elst, buildElst(elst)],
    [stts, buildStts(originalSizes.length, fakeSampleCount)],
    [stsc, buildStsc(originalStscRows, originalChunkOffsets.length)],
    [stsz, buildStsz(originalSizes, fakeSampleCount)]
  ]);

  // Pass 1 — placeholder untuk hitung size moov baru
  const placeholderRep = new Map(fixedReplacements);
  buildStcoReplacements(stcoBoxes, stco, 0, 0, fakeSampleCount).forEach((v, k) => placeholderRep.set(k, v));
  const moovPlaceholder = rebuildBox(moov, placeholderRep);
  const preservedBytes = concatBytes(preservedTopLevel);
  const oldMdatPayload = data.slice(mdat.contentStart, mdat.end);

  let newMdatPayloadStart = ftyp.size + moovPlaceholder.length + preservedBytes.length + 8;
  let delta = newMdatPayloadStart - mdat.contentStart;
  let fakeOffset = newMdatPayloadStart + oldMdatPayload.length;

  // Pass 2 — patch offset dengan delta bener
  let finalRep = new Map(fixedReplacements);
  buildStcoReplacements(stcoBoxes, stco, delta, fakeOffset, fakeSampleCount).forEach((v, k) => finalRep.set(k, v));
  let moovNew = rebuildBox(moov, finalRep);

  // Pass 3 — recalculate kalau moov size berubah
  const recalculated = ftyp.size + moovNew.length + preservedBytes.length + 8;
  delta = recalculated - mdat.contentStart;
  fakeOffset = recalculated + oldMdatPayload.length;

  finalRep = new Map(fixedReplacements);
  buildStcoReplacements(stcoBoxes, stco, delta, fakeOffset, fakeSampleCount).forEach((v, k) => finalRep.set(k, v));
  moovNew = rebuildBox(moov, finalRep);

  // Build mdat baru: payload asli + fake sample bytes
  const mdatNew = makeBox('mdat', concatBytes([oldMdatPayload, SHARK.FAKE_SAMPLE_BYTES]));

  // Assemble final
  const output = concatBytes([boxBytes(ftyp), moovNew, preservedBytes, mdatNew]);

  return {
    output: output.buffer,
    realSamples: originalSizes.length,
    fakeSamples: fakeSampleCount,
    fakeOffset,
    stcoDelta: delta
  };
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

/* ═══════════════════════════════════════════════
   MAIN PATCH RUNNER
   ═══════════════════════════════════════════════ */

async function runSmartPatch() {
  let file = AppState.files.patch;
  if (!file && window._reyyPatchFile) { file = window._reyyPatchFile; AppState.files.patch = file; }
  if (!file) { showToast("Pilih file dulu!"); return; }

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
    let outputBuffer = await file.arrayBuffer();

    if (progressFill) progressFill.style.width = "20%";
    if (progressPct) progressPct.textContent = "20%";
    if (progressLabel) progressLabel.textContent = "Applying metadata stamp...";

    // Step 1: Encoder string patch
    try {
      patchEncoderStr(new Uint8Array(outputBuffer));
      console.log('[SmartPatch] Encoder string patched');
    } catch (e) { console.warn('Encoder str failed:', e.message); }

    if (progressFill) progressFill.style.width = "40%";
    if (progressPct) progressPct.textContent = "40%";
    if (progressLabel) progressLabel.textContent = "Injecting MTLib atom...";

    // Step 2: Inject MTLib
    try {
      const mt = injectMTLib(outputBuffer);
      if (mt.injected) {
        outputBuffer = mt.buffer;
        console.log('[SmartPatch] MTLib injected');
      }
    } catch (e) { console.warn('MTLib failed:', e.message); }

    if (progressFill) progressFill.style.width = "60%";
    if (progressPct) progressPct.textContent = "60%";
    if (progressLabel) progressLabel.textContent = "Applying Shark Sample Table...";

    // Step 3: SHARK SAMPLE TABLE — ini kuncinya
    setStatus(
      document.getElementById("patchStatus"),
      document.getElementById("patchStatusText"),
      "working",
      "Shark Sample Table processing..."
    );

    const res = patchSharkSampleTableMethod(outputBuffer);
    outputBuffer = res.output;
    console.log(`[SmartPatch] Shark: real=${res.realSamples} fake=${res.fakeSamples} delta=${res.stcoDelta}`);

    if (progressFill) progressFill.style.width = "90%";
    if (progressPct) progressPct.textContent = "90%";

    const blob = new Blob([outputBuffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    const a = document.createElement("a");
    a.href = url;
    a.download = `reyy-shark-patched-${Date.now()}.mp4`;
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

    setStatus(
      document.getElementById("patchStatus"),
      document.getElementById("patchStatusText"),
      "ok",
      `Shark patched: ${res.realSamples} real + ${res.fakeSamples} fake (${elapsed}s)`
    );

    showToast(`Patch berhasil! ${res.realSamples}+${res.fakeSamples} samples (${elapsed}s)`);

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