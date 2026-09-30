/* ═══════════════════════════════════════════════
   𝙧𝙚𝙮𝙮 𝙩𝙤𝙤𝙡𝙨 — TikTok Analyzer
   Check video upload quality via tikwm API
   by.reyystecu
   ═══════════════════════════════════════════════ */

function initAnalyzer() {
  const input = document.getElementById("ttUrl");
  if (!input) return;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") analyzeTikTok();
  });
}

async function analyzeTikTok() {
  const rawUrl = document.getElementById("ttUrl").value.trim();
  const loading = document.getElementById("analyzerLoading");
  const errBox = document.getElementById("analyzerError");
  const errMsg = document.getElementById("analyzerErrorMsg");
  const results = document.getElementById("analyzerResults");
  const analyzeBtn = document.getElementById("analyzeBtn");

  if (!rawUrl) { showToast("Paste URL TikTok dulu"); return; }
  if (!/tiktok\.com/i.test(rawUrl)) { showToast("Harus link TikTok"); return; }

  loading.classList.add("show");
  errBox.classList.remove("show");
  results.classList.remove("show");
  if (analyzeBtn) analyzeBtn.disabled = true;

  const encoded = encodeURIComponent(rawUrl);

  const attempts = [
    async () => {
      const t = `https://www.tikwm.com/api/?url=${encoded}&hd=1`;
      const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(t)}`);
      const p = await r.json();
      const d = JSON.parse(p.contents);
      if (!d || d.code !== 0 || !d.data) throw new Error(d.msg || "no data");
      return d.data;
    },
    async () => {
      const t = `https://www.tikwm.com/api/?url=${encoded}&hd=1`;
      const r = await fetch(`https://corsproxy.io/?${encodeURIComponent(t)}`);
      const d = await r.json();
      if (!d || d.code !== 0 || !d.data) throw new Error(d.msg || "no data");
      return d.data;
    },
    async () => {
      const t = `https://tikwm.com/api/?url=${encoded}&hd=1&web=1`;
      const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(t)}`);
      const p = await r.json();
      const d = JSON.parse(p.contents);
      if (!d || d.code !== 0 || !d.data) throw new Error(d.msg || "no data");
      return d.data;
    },
    async () => {
      const r = await fetch(`https://www.tikwm.com/api/?url=${encoded}&hd=1`, { mode: "cors" });
      const d = await r.json();
      if (!d || d.code !== 0 || !d.data) throw new Error(d.msg || "no data");
      return d.data;
    }
  ];

  for (let i = 0; i < attempts.length; i++) {
    try {
      const data = await attempts[i]();
      loading.classList.remove("show");
      if (analyzeBtn) analyzeBtn.disabled = false;
      renderAnalyzerResults(data);
      return;
    } catch (e) {
      if (i === attempts.length - 1) {
        loading.classList.remove("show");
        if (analyzeBtn) analyzeBtn.disabled = false;
        errMsg.textContent = "Semua metode gagal. Pastikan link benar & video publik.";
        errBox.classList.add("show");
      }
    }
  }
}

function renderAnalyzerResults(d) {
  const results = document.getElementById("analyzerResults");
  const metaGrid = document.getElementById("metaGrid");
  const hdBadge = document.getElementById("hdBadge");
  const infoRow = document.getElementById("analyzerInfo");

  let isHD = !!(d.hdplay && d.hdplay.length > 10);
  let w = parseInt(d.width) || 0;
  let h = parseInt(d.height) || 0;

  if (!w || !h) {
    const urls = [d.hdplay || "", d.play || "", d.wmplay || "", d.cover || ""];
    for (const url of urls) {
      const m = url.match(/[_~\/=](\d{3,4})x(\d{3,4})/);
      if (m) {
        w = Math.min(+m[1], +m[2]);
        h = Math.max(+m[1], +m[2]);
        break;
      }
    }
  }
  if (w >= 1080 || h >= 1080) isHD = true;

  if (isHD) {
    hdBadge.className = "hd-badge ok";
    hdBadge.innerHTML = `
      <span class="hd-badge-icon"><svg class="svg-icon" style="width:2rem;height:2rem;color:var(--green)"><use href="#i-check"/></svg></span>
      <div>
        <div class="hd-badge-title">HD Upload Detected</div>
        <div class="hd-badge-sub">Video lu di-process HD sama TikTok.</div>
      </div>
    `;
  } else {
    hdBadge.className = "hd-badge no";
    hdBadge.innerHTML = `
      <span class="hd-badge-icon"><svg class="svg-icon" style="width:2rem;height:2rem;color:var(--yellow)"><use href="#i-alert"/></svg></span>
      <div>
        <div class="hd-badge-title">Standard Quality (Not HD)</div>
        <div class="hd-badge-sub">TikTok compress video ini. Coba re-upload pakai SmartPatch.</div>
      </div>
    `;
  }

  const thumb = document.getElementById("analyzerThumb");
  const coverUrl = d.cover || d.origin_cover || "";
  if (coverUrl) {
    thumb.src = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=160&h=214&fit=cover`;
    thumb.onerror = () => { thumb.style.display = "none"; };
  }

  document.getElementById("videoCaption").textContent = d.title || "(no caption)";
  const authorName = d.author
    ? `${d.author.nickname || "Unknown"}${d.author.unique_id ? " (@" + d.author.unique_id + ")" : ""}`
    : "Unknown";
  document.getElementById("videoAuthor").textContent = authorName;
  infoRow.classList.add("show");

  const fmtSize = (bytes) => {
    if (!bytes || bytes <= 0) return "N/A";
    if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1024).toFixed(0) + " KB";
  };

  let resStr, resCls;
  if (w && h) {
    resStr = `${w} × ${h}`;
    resCls = (w >= 1080 || h >= 1080) ? "green" : (w >= 720 || h >= 720) ? "yellow" : "";
  } else {
    resStr = isHD ? "≥ 1080p (HD)" : "720p or lower";
    resCls = isHD ? "green" : "yellow";
  }

  const fpsHint = isHD ? "30–60 fps" : "30 fps";

  const items = [
    { label: "Resolution", val: resStr, cls: resCls },
    { label: "Duration", val: d.duration ? formatDuration(d.duration) : "N/A", cls: "yellow" },
    { label: "Est. FPS", val: fpsHint, cls: "" },
    { label: "HD Stream", val: isHD ? "Available" : "Not Available", cls: isHD ? "green" : "" },
    { label: "File Size", val: fmtSize(d.size), cls: "" },
    { label: "HD Size", val: fmtSize(d.hd_size), cls: "" },
    { label: "Views", val: d.play_count ? Number(d.play_count).toLocaleString() : "N/A", cls: "accent" },
    { label: "Likes", val: d.digg_count ? Number(d.digg_count).toLocaleString() : "N/A", cls: "accent" },
    { label: "Comments", val: d.comment_count ? Number(d.comment_count).toLocaleString() : "N/A", cls: "" },
    { label: "Shares", val: d.share_count ? Number(d.share_count).toLocaleString() : "N/A", cls: "" }
  ];

  metaGrid.innerHTML = items.map(it => `
    <div class="meta-item">
      <div class="meta-label">${it.label}</div>
      <div class="meta-val ${it.cls}">${it.val}</div>
    </div>
  `).join("");

  results.classList.add("show");
}