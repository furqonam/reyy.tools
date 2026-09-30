/* ═══════════════════════════════════════════════
   𝙧𝙚𝙮𝙮 𝙩𝙤𝙤𝙡𝙨 — Account Module
   Profile management (localStorage)
   by.reyystecu
   ═══════════════════════════════════════════════ */

const PROFILE_KEY = "reyyTools.profile";

let profile = {
  name: "Guest",
  avatar: null,
  tgId: "",
  tgUser: ""
};

function initAccount() {
  loadProfile();
  applyProfile();
}

function loadProfile() {
  try {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      profile = { ...profile, ...parsed };
    }
  } catch (e) {
    console.warn("Failed to load profile", e);
  }
}

function saveProfileToStorage() {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.warn("Failed to save profile", e);
    showToast("Storage penuh / nggak available");
  }
}

function applyProfile() {
  const name = profile.name || "Guest";
  const tgId = profile.tgId || "";
  const tgUser = profile.tgUser || "";

  const nameBadge = document.getElementById("nameBadge");
  const roleBadge = document.getElementById("roleBadge");
  const avatarInitial = document.getElementById("avatarInitial");
  const inputName = document.getElementById("inputName");
  const inputTgId = document.getElementById("inputTgId");
  const inputTgUser = document.getElementById("inputTgUser");

  if (nameBadge) nameBadge.textContent = name;
  if (roleBadge) roleBadge.textContent = tgId ? "Telegram Linked" : "Guest User";
  if (avatarInitial) avatarInitial.textContent = name.charAt(0).toUpperCase();
  if (inputName) inputName.value = name !== "Guest" ? name : "";
  if (inputTgId) inputTgId.value = tgId;
  if (inputTgUser) inputTgUser.value = tgUser;

  const tgStatus = document.getElementById("tgStatus");
  const tgStatusText = document.getElementById("tgStatusText");
  if (tgId && tgStatus && tgStatusText) {
    tgStatus.classList.add("linked");
    tgStatusText.textContent = `Linked: ${tgUser ? tgUser + " (" + tgId + ")" : tgId}`;
  } else if (tgStatus && tgStatusText) {
    tgStatus.classList.remove("linked");
    tgStatusText.textContent = "Belum ada Telegram — running as Guest";
  }

  if (profile.avatar) {
    const img = document.getElementById("avatarImg");
    const initial = document.getElementById("avatarInitial");
    if (img) {
      img.src = profile.avatar;
      img.classList.add("loaded");
    }
    if (initial) initial.style.display = "none";
  }
}

function saveProfile() {
  const inputName = document.getElementById("inputName");
  if (!inputName) return;
  const name = inputName.value.trim() || "Guest";
  profile.name = name;
  saveProfileToStorage();
  applyProfile();
  showToast("Profile saved");
}

function saveTelegram() {
  const id = document.getElementById("inputTgId").value.trim();
  const user = document.getElementById("inputTgUser").value.trim();
  if (!id) {
    showToast("Masukkan Telegram ID dulu");
    return;
  }
  profile.tgId = id;
  profile.tgUser = user;
  saveProfileToStorage();
  applyProfile();
  showToast("Telegram linked");
}

function unlinkTelegram() {
  profile.tgId = "";
  profile.tgUser = "";
  saveProfileToStorage();
  applyProfile();
  showToast("Telegram unlinked");
}

function handleAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) {
    showToast("Avatar max 500 KB");
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    profile.avatar = ev.target.result;
    saveProfileToStorage();
    applyProfile();
    showToast("Avatar updated");
  };
  reader.onerror = () => showToast("Gagal baca file");
  reader.readAsDataURL(file);
}