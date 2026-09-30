/* ═══════════════════════════════════════════════
   𝙧𝙚𝙮𝙮 𝙩𝙤𝙤𝙡𝙨 — Core App Logic
   by.reyystecu
   ═══════════════════════════════════════════════ */

const AppState = {
  currentPage: "home",
  currentTool: "patcher",
  files: { patch: null, enc: null, upscale: null, cloudVideo: null }
};

function switchMain(tab) {
  document.querySelectorAll(".page-view").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".mtab").forEach(b => b.classList.remove("active"));
  const page = document.getElementById("page-" + tab);
  const btn = document.getElementById("mtab-" + tab);
  if (page) page.classList.add("active");
  if (btn) btn.classList.add("active");
  AppState.currentPage = tab;
  window.scrollTo({ top: 0, behavior: "instant" });
  const navLinks = document.getElementById("navLinks");
  if (navLinks) navLinks.classList.remove("open");
}

function switchTool(tool) {
  document.querySelectorAll(".tool-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tool-tab").forEach(t => t.classList.remove("active"));
  const panel = document.getElementById("tool-" + tool);
  const tab = document.querySelector(`.tool-tab[data-tool="${tool}"]`);
  if (panel) panel.classList.add("active");
  if (tab) tab.classList.add("active");
  AppState.currentTool = tool;
}

function showToast(msg, dur) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove("show"), dur || 2600);
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
  return (bytes / 1073741824).toFixed(2) + " GB";
}

function formatDuration(seconds) {
  seconds = Math.floor(seconds) || 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function setStatus(statusEl, textEl, state, text) {
  if (statusEl) {
    statusEl.classList.remove("ok", "working", "error");
    if (state) statusEl.classList.add(state);
  }
  if (textEl) textEl.textContent = text;
}

document.addEventListener("DOMContentLoaded", () => {
  const burger = document.getElementById("burger");
  const navLinks = document.getElementById("navLinks");
  if (burger && navLinks) {
    burger.addEventListener("click", () => navLinks.classList.toggle("open"));
  }

  document.querySelectorAll(".tool-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const tool = tab.dataset.tool;
      if (tool) switchTool(tool);
    });
  });

  setTimeout(() => {
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 500);
    }
  }, 1400);

  if (typeof initPatcher === "function") initPatcher();
  if (typeof initEncoder === "function") initEncoder();
  if (typeof initUpscale === "function") initUpscale();
  if (typeof initAnalyzer === "function") initAnalyzer();
  if (typeof initAccount === "function") initAccount();
});

/* ── PARTICLE BACKGROUND ── */
(function initParticles() {
  const canvas = document.getElementById("particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H;
  const particles = [];
  const COUNT = 60;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  function Particle() {
    this.x = Math.random() * W;
    this.y = Math.random() * H;
    this.r = 0.6 + Math.random() * 1.6;
    this.dx = (Math.random() - 0.5) * 0.25;
    this.dy = (Math.random() - 0.5) * 0.25;
    this.opacity = 0.15 + Math.random() * 0.35;
  }
  Particle.prototype.update = function () {
    this.x += this.dx;
    this.y += this.dy;
    if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
    }
  };
  Particle.prototype.draw = function () {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(77, 208, 255, " + this.opacity + ")";
    ctx.fill();
  };

  for (let i = 0; i < COUNT; i++) particles.push(new Particle());

  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }
    requestAnimationFrame(loop);
  }
  loop();
})();