/* ══════════════════════════════════════════
   CONFIG
══════════════════════════════════════════ */
const PRINTERS = [
  { ip: "192.168.0.24", model: "Ender3 V3 Plus", id: "Printer1"  },
  { ip: "192.168.0.33", model: "Ender3 V3 Plus", id: "Printer2"  },
  { ip: "192.168.0.11", model: "Ender3 V3 Plus", id: "Printer3"  },
  { ip: "192.168.0.22", model: "Ender3 V3 Plus", id: "Printer4"  },
  { ip: "192.168.0.14", model: "K1A",            id: "Printer5"  },
  { ip: "192.168.0.15", model: "K1A",            id: "Printer6"  },
  { ip: "192.168.0.17", model: "K1A",            id: "Printer7"  },
  { ip: "192.168.0.23", model: "K1A",            id: "Printer8"  },
  { ip: "192.168.0.6",  model: "K1A",            id: "Printer9"  },
  { ip: "192.168.0.21", model: "K1 MAX",         id: "Printer10" },
  { ip: "192.168.0.3",  model: "K1 MAX",         id: "Printer11" },
  { ip: "192.168.0.32", model: "Ender5 MAX",     id: "Printer12" },
  { ip: "192.168.0.25", model: "Ender5 MAX",     id: "Printer13" },
  { ip: "192.168.0.20", model: "Ender5 MAX",     id: "Printer14" },
];

const AUTO_DELAY  = 30_000;
const THUMB_MS    = 1000;
const RETRY_MS    = 10_000;
const STATUS_MS   = 5000;

/* ══════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════ */
const html            = document.documentElement;
const mainEl          = document.querySelector(".main");
const errorBadgeBtn   = document.getElementById("errorBadgeBtn");
const errorBanner     = document.getElementById("errorBanner");
const errorCountEl    = document.getElementById("errorCount");
const themeToggle     = document.getElementById("themeToggle");
const themeIcon       = document.getElementById("themeIcon");
const printerCountEl  = document.getElementById("printerCount");

const focusHeader     = document.getElementById("focusHeader");
const focusEmpty      = document.getElementById("focusEmpty");
const focusBody       = document.getElementById("focusBody");
const focusFooter     = document.getElementById("focusFooter");
const focusTitle      = document.getElementById("focusTitle");
const focusImg        = document.getElementById("focusImg");
const focusInfo       = document.getElementById("focusInfo");
const loadingOverlay  = document.getElementById("loadingOverlay");
const progressBar     = document.getElementById("progressBar");
const closeBtn        = document.getElementById("closeBtn");
const pinBtn          = document.getElementById("pinBtn");
const pauseResumeBtn  = document.getElementById("pauseResumeBtn");
const printInfoBar    = document.getElementById("printInfoBar");
const focusInfoPanel  = document.getElementById("focusInfoPanel");
const historyContent  = document.getElementById("historyContent");
const timelapseContent= document.getElementById("timelapseContent");
const timelapseGrid   = document.getElementById("timelapseGrid");
const infoBtn         = document.getElementById("infoBtn");
const printFileBtn    = document.getElementById("printFileBtn");

const fileModal       = document.getElementById("fileModal");
const fileModalBody   = document.getElementById("fileModalBody");
const fileModalClose  = document.getElementById("fileModalClose");
const fileModalOverlay= document.getElementById("fileModalOverlay");

const videoModal       = document.getElementById("videoModal");
const videoPlayer      = document.getElementById("videoPlayer");
const videoModalTitle  = document.getElementById("videoModalTitle");
const videoModalClose  = document.getElementById("videoModalClose");
const videoPipBtn      = document.getElementById("videoPipBtn");
const videoModalOverlay= document.getElementById("videoModalOverlay");

const livePipBtn     = document.getElementById("livePipBtn");

const toastContainer  = document.getElementById("toastContainer");

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
let currentIndex  = -1;
let isPinned      = false;
let isInfoOpen    = false;
let isFileOpen    = false;
let autoTimer     = null;
let theme         = "dark";
let infoLoaded    = null;

const thumbTimers = new Map();
const statusCache = new Map();
const brokenSet   = new Set();

let focusTimer    = null;
let allViewers    = [];
let activeViewers = [];

// 새로고침해도 확대해서 보고 있던 프린터 화면이 그대로 유지되도록, 선택된 IP를 저장해둔다
const FOCUS_IP_KEY = "print-viewer-focus-ip";

/* ══════════════════════════════════════════
   INIT — BUILD PRINTER CARDS
══════════════════════════════════════════ */
(function buildCards() {
  const grid = document.getElementById("grid");
  PRINTERS.forEach(p => {
    const card = document.createElement("div");
    card.className       = "viewer";
    card.dataset.ip      = p.ip;
    card.dataset.title   = `${p.ip} ${p.model}`;
    card.dataset.printer = p.id;
    card.dataset.model   = p.model;
    card.innerHTML = `
      <div class="viewer-header">
        <span class="viewer-header-text">${p.ip} · ${p.model}</span>
        <span class="state-dot" id="dot-${p.id}"></span>
      </div>
      <div class="viewer-body">
        <img src="" alt="" />
        <div class="viewer-badge">📷 LIVE</div>
      </div>
      <div class="print-strip"><div class="print-strip-fill" id="strip-${p.id}"></div></div>`;
    grid.appendChild(card);
  });

  allViewers    = Array.from(document.querySelectorAll(".viewer"));
  activeViewers = [...allViewers];
  printerCountEl.textContent = allViewers.length;
})();

/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */
function snapshotUrl(ip) {
  return `/proxy/${ip}/?action=snapshot`;
}

function fmtSize(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + " GB";
  if (bytes >= 1048576)    return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024)       return (bytes / 1024).toFixed(0) + " KB";
  return bytes + " B";
}

function fmtDate(ts) {
  if (!ts) return "";
  const d   = new Date(ts * 1000);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(sec) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtSecs(s) {
  s = parseInt(s);
  if (!s || isNaN(s)) return "";
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function showToast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add("out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 3000);
}

function showConfirm(msg, onConfirm) {
  document.querySelectorAll(".toast.confirm-toast").forEach(el => el.remove());
  const el = document.createElement("div");
  el.className = "toast confirm-toast";
  el.innerHTML = `<span class="toast-msg"></span><div class="toast-actions"><button class="toast-btn">취소</button><button class="toast-btn toast-btn--danger">확인</button></div>`;
  el.querySelector(".toast-msg").textContent = msg;
  toastContainer.appendChild(el);

  let done = false;
  const resolve = yes => {
    if (done) return;
    done = true;
    el.classList.add("out");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    if (yes) onConfirm();
  };
  el.querySelectorAll(".toast-btn")[0].addEventListener("click", () => resolve(false));
  el.querySelectorAll(".toast-btn")[1].addEventListener("click", () => resolve(true));
  setTimeout(() => resolve(false), 5000);
}

function getStateName(data) {
  if (!data || data.error) return "unknown";
  const s = Number(data.state ?? data.deviceState ?? -1);
  if (s === 0) return "stopped";
  if (s === 1) return "printing";
  if (s === 2) return "complete";
  if (s === 3) return "error";
  if (s === 5) return "paused";
  return "unknown";
}

/* ══════════════════════════════════════════
   ERROR / CONNECTION
══════════════════════════════════════════ */
function markBroken(viewer) {
  if (brokenSet.has(viewer)) return;
  brokenSet.add(viewer);
  viewer.classList.add("broken");
  activeViewers = allViewers.filter(v => !brokenSet.has(v));
  printerCountEl.textContent = activeViewers.length;
  renderErrorBanner();
}

function markRecovered(viewer) {
  if (!brokenSet.has(viewer)) return;
  brokenSet.delete(viewer);
  viewer.classList.remove("broken");
  activeViewers = allViewers.filter(v => !brokenSet.has(v));
  printerCountEl.textContent = activeViewers.length;
  renderErrorBanner();
}

function renderErrorBanner() {
  if (!brokenSet.size) {
    errorBadgeBtn.classList.remove("show");
    errorBanner.classList.remove("show");
    errorBanner.innerHTML = "";
    return;
  }
  errorCountEl.textContent = brokenSet.size;
  errorBadgeBtn.classList.add("show");

  const items = [...brokenSet].map(v => {
    const label = v.dataset.model
      ? `${v.dataset.printer} · ${v.dataset.model} (${v.dataset.ip})`
      : v.dataset.ip || "?";
    return `<span class="printer-link" data-ip="${v.dataset.ip}">${label}</span>`;
  }).join("&nbsp;· ");

  errorBanner.innerHTML = `<span class="err-badge">${brokenSet.size}</span>&nbsp;연결 끊김: ${items}`;
  errorBanner.classList.add("show");
}

errorBanner.addEventListener("click", e => {
  const link = e.target.closest(".printer-link");
  if (!link) return;
  const viewer = allViewers.find(v => v.dataset.ip === link.dataset.ip);
  const name = viewer ? (viewer.dataset.model || viewer.dataset.printer || link.dataset.ip) : link.dataset.ip;
  showToast(`${name} — 연결이 끊겼습니다`, "error");
});

/* ══════════════════════════════════════════
   THEME
══════════════════════════════════════════ */
function applyTheme(t) {
  theme = t;
  html.setAttribute("data-theme", t);
  themeIcon.textContent = t === "dark" ? "🌙" : "☀️";
  localStorage.setItem("tv-theme", t);
}

themeToggle.addEventListener("click", () => applyTheme(theme === "dark" ? "light" : "dark"));
const savedTheme = localStorage.getItem("tv-theme");
if (savedTheme) applyTheme(savedTheme);

/* ══════════════════════════════════════════
   PROGRESS BAR
══════════════════════════════════════════ */
function startProgress() {
  progressBar.style.transition = "none";
  progressBar.style.width = "0%";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    progressBar.style.transition = `width ${AUTO_DELAY}ms linear`;
    progressBar.style.width = "100%";
  }));
}

function stopProgress() {
  progressBar.style.transition = "none";
  progressBar.style.width = "0%";
}

/* ══════════════════════════════════════════
   AUTO SLIDE
══════════════════════════════════════════ */
function scheduleNext() {
  stopAutoSlide();
  if (isPinned || isInfoOpen || isFileOpen || activeViewers.length === 0 || currentIndex === -1) return;
  startProgress();
  autoTimer = setTimeout(() => {
    if (isPinned || currentIndex === -1) return;
    const cur  = activeViewers.indexOf(allViewers[currentIndex]);
    const next = (cur < 0 ? 0 : cur + 1) % activeViewers.length;
    openFocus(activeViewers[next]);
    scrollToViewer(activeViewers[next]);
  }, AUTO_DELAY);
}

function startAutoSlide() { scheduleNext(); }

function stopAutoSlide() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  stopProgress();
}

/* ══════════════════════════════════════════
   FOCUS PANEL
══════════════════════════════════════════ */
function clearActive() {
  allViewers.forEach(v => v.classList.remove("active"));
}

function showFocusUI(visible) {
  mainEl.classList.toggle("has-focus", visible);
  focusHeader.classList.toggle("hidden", !visible);
  focusFooter.classList.toggle("hidden", !visible);
  focusEmpty.classList.toggle("hidden", visible);
  if (visible) {
    focusBody.classList.add("visible");
  } else {
    focusBody.classList.remove("visible");
  }
}

function scrollToViewer(viewer) {
  viewer.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function openFocus(viewer, direction = "left") {
  stopAutoSlide();

  currentIndex = allViewers.indexOf(viewer);
  const { title, ip, printer, model } = viewer.dataset;
  localStorage.setItem(FOCUS_IP_KEY, ip);

  clearActive();
  viewer.classList.add("active");

  focusTitle.textContent = title || "";
  focusInfo.textContent  = model ? `${printer} · ${model}` : (printer || "—");

  loadingOverlay.classList.add("show");
  focusImg.classList.remove("slide-in", "slide-in-rev");

  focusImg.onload = () => {
    focusImg.onload  = null;
    focusImg.onerror = null;
    loadingOverlay.classList.remove("show");
    const cls = direction === "right" ? "slide-in-rev" : "slide-in";
    requestAnimationFrame(() => {
      focusImg.classList.add(cls);
      focusImg.addEventListener("animationend", () => focusImg.classList.remove(cls), { once: true });
    });
    if (!isPinned) scheduleNext();
  };
  focusImg.onerror = () => {
    focusImg.onload  = null;
    focusImg.onerror = null;
    loadingOverlay.classList.remove("show");
    markBroken(viewer);
    closeFocus();
  };
  focusImg.src = `/proxy/${ip}/?action=stream`;

  showFocusUI(true);

  updateFocusPrintInfo(ip);

  if (focusInfoPanel.classList.contains("visible")) {
    loadPrinterInfo(ip);
  }

  if (window.innerWidth <= 900) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function closeFocus() {
  focusImg.onload  = null;
  focusImg.onerror = null;
  focusImg.src = "";
  loadingOverlay.classList.remove("show");
  showFocusUI(false);
  focusInfo.textContent = "—";
  clearActive();
  currentIndex = -1;
  stopAutoSlide();
  localStorage.removeItem(FOCUS_IP_KEY);

  printInfoBar.classList.remove("show");
  pauseResumeBtn.classList.remove("show");
  isInfoOpen = false;
  focusInfoPanel.classList.remove("visible");
  infoBtn.classList.remove("pin-active");
}

/* ══════════════════════════════════════════
   SNAPSHOT POLLING — THUMBNAIL
══════════════════════════════════════════ */
function startThumbPoll(viewer) {
  if (thumbTimers.has(viewer)) return;
  const img = viewer.querySelector(".viewer-body img");
  if (!img) return;
  const ip = viewer.dataset.ip;

  function schedule() {
    if (!thumbTimers.has(viewer)) return;
    const delay = brokenSet.has(viewer) ? RETRY_MS : THUMB_MS;
    thumbTimers.set(viewer, setTimeout(tick, delay));
  }

  function tick() {
    if (!thumbTimers.has(viewer)) return;
    const tmp = new Image();
    tmp.onload = () => {
      if (!thumbTimers.has(viewer)) return;
      img.src = tmp.src;
      if (brokenSet.has(viewer)) markRecovered(viewer);
      schedule();
    };
    tmp.onerror = () => {
      if (!thumbTimers.has(viewer)) return;
      markBroken(viewer);
      schedule();
    };
    tmp.src = snapshotUrl(ip) + "&_t=" + Date.now();
  }

  thumbTimers.set(viewer, null);
  tick();
}

function stopThumbPoll(viewer) {
  const t = thumbTimers.get(viewer);
  if (t !== undefined) { clearTimeout(t); thumbTimers.delete(viewer); }
}

/* ══════════════════════════════════════════
   PRINTER STATUS
══════════════════════════════════════════ */
function updateCardStatus(viewer, data) {
  const id   = viewer.dataset.printer;
  const dot  = document.getElementById(`dot-${id}`);
  const fill = document.getElementById(`strip-${id}`);
  if (!dot || !fill) return;
  const state = getStateName(data);
  dot.className  = `state-dot ${state === "unknown" ? "" : state}`;
  fill.style.width = (state === "printing" || state === "paused")
    ? `${data.printProgress ?? 0}%` : "0%";
}

function updateFocusPrintInfo(ip) {
  const data  = statusCache.get(ip);
  const state = getStateName(data);
  const active = state === "printing" || state === "paused";

  if (!active || !data) {
    printInfoBar.classList.remove("show");
    pauseResumeBtn.classList.remove("show");
    return;
  }

  const fileName = (data.printFileName || "").split("/").pop() || "—";
  const progress = data.printProgress ?? "—";
  const layer    = data.layer ?? "—";
  const leftTime = data.printLeftTime ? formatTime(data.printLeftTime) : "—";
  const nozzle   = data.nozzleTemp0 ? parseFloat(data.nozzleTemp0).toFixed(0) + "°C" : "—";
  const bed      = data.bedTemp0    ? parseFloat(data.bedTemp0).toFixed(0)    + "°C" : "—";
  const label    = state === "printing" ? "출력중" : "일시정지";

  printInfoBar.innerHTML = `
    <span class="print-state-chip ${state}">${label}</span>
    <span>📄 ${fileName}</span>
    <span>⚡ ${progress}%</span>
    <span>📐 ${layer}레이어</span>
    <span>⏱ 남은 ${leftTime}</span>
    <span>🌡 노즐 ${nozzle} · 베드 ${bed}</span>`;
  printInfoBar.classList.add("show");

  pauseResumeBtn.classList.add("show");
  if (state === "printing") {
    pauseResumeBtn.textContent    = "⏸ 일시정지";
    pauseResumeBtn.className      = "ctrl-btn danger show";
    pauseResumeBtn.dataset.action = "pause";
  } else {
    pauseResumeBtn.textContent    = "▶ 재개";
    pauseResumeBtn.className      = "ctrl-btn success show";
    pauseResumeBtn.dataset.action = "resume";
  }
}

async function pollStatuses() {
  const viewers = allViewers.filter(v => !brokenSet.has(v));
  await Promise.all(viewers.map(async v => {
    try {
      const r    = await fetch(`/api/status/${v.dataset.ip}`);
      const data = await r.json();
      if (!data.error) {
        statusCache.set(v.dataset.ip, data);
        updateCardStatus(v, data);
      }
    } catch(e) {}
  }));
  if (currentIndex >= 0) {
    const ip = allViewers[currentIndex]?.dataset.ip;
    if (ip) updateFocusPrintInfo(ip);
  }
}

pauseResumeBtn.addEventListener("click", async () => {
  const viewer = currentIndex >= 0 ? allViewers[currentIndex] : null;
  if (!viewer) return;
  const ip     = viewer.dataset.ip;
  const action = pauseResumeBtn.dataset.action;

  pauseResumeBtn.disabled    = true;
  pauseResumeBtn.textContent = "처리중...";

  try {
    await fetch(`/api/${action}/${ip}`, { method: "POST" });
  } catch(e) {}

  setTimeout(async () => {
    try {
      const r    = await fetch(`/api/status/${ip}`);
      const data = await r.json();
      if (!data.error) {
        statusCache.set(ip, data);
        updateCardStatus(viewer, data);
        updateFocusPrintInfo(ip);
      }
    } catch(e) {}
    pauseResumeBtn.disabled = false;
  }, 1000);
});

/* ══════════════════════════════════════════
   INFO PANEL — HISTORY / TIMELAPSE
══════════════════════════════════════════ */
function renderHistory(data) {
  historyContent.innerHTML = "";

  if (!data || data.error) {
    historyContent.innerHTML = '<div class="info-empty">불러오기 실패</div>';
    return;
  }
  const jobs = data.historyList;
  if (!jobs || !jobs.length) {
    historyContent.innerHTML = '<div class="info-empty">출력 기록이 없습니다</div>';
    return;
  }
  jobs.slice(0, 40).forEach(j => {
    const name      = (j.filename || "—").split("/").pop();
    const finished  = j.printfinish === 1;
    const statusCls = finished ? "completed" : (j.printfinish === 0 ? "in_progress" : "error");
    const statusTxt = finished ? "완료"       : (j.printfinish === 0 ? "미완료"       : "오류");
    const meta      = [fmtDate(j.starttime), fmtDuration(j.usagetime),
                       j.usagematerial ? (j.usagematerial / 1000).toFixed(1) + "m" : ""]
                      .filter(Boolean).join(" · ");
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `
      <span class="history-status ${statusCls}">${statusTxt}</span>
      <span class="history-name" title="${name}">${name}</span>
      <span class="history-meta">${meta}</span>`;
    historyContent.appendChild(row);
  });
}

function renderTimelapse(data, ip) {
  timelapseGrid.innerHTML = "";

  if (!data || data.error) {
    timelapseGrid.innerHTML = '<div class="info-empty">불러오기 실패</div>';
    return;
  }
  const done = (data.historyList || []).filter(j => j.printfinish === 1);
  if (!done.length) {
    timelapseGrid.innerHTML = '<div class="info-empty">타임랩스 영상이 없습니다</div>';
    return;
  }
  done.forEach(j => {
    const name      = (j.filename || "—").split("/").pop();
    const meta      = [fmtDate(j.starttime), fmtDuration(j.usagetime)].filter(Boolean).join(" · ");
    const gcodeBase = (j.filename || "").split("/").pop();
    const thumbSrc  = gcodeBase ? `/api/thumbnail/${ip}/${encodeURIComponent(gcodeBase)}` : "";

    const card = document.createElement("div");
    card.className = "timelapse-card";
    card.title = name;
    card.innerHTML = `
      <div class="timelapse-thumb-wrap" id="tw-${j.id}">
        <img src="${thumbSrc}" alt=""
             onerror="document.getElementById('tw-${j.id}').classList.add('no-thumb')">
        <button class="timelapse-del-btn" title="삭제">✕</button>
      </div>
      <div class="timelapse-info">
        <div class="timelapse-info-name">${name}</div>
        <div class="timelapse-info-meta">${meta}</div>
      </div>`;

    card.querySelector(".timelapse-del-btn").addEventListener("click", e => {
      e.stopPropagation();
      showConfirm(`"${name}" 타임랩스를 삭제할까요?`, () => {
        fetch(`/api/timelapse/${ip}/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [j.id] })
        }).then(r => r.json()).then(() => card.remove()).catch(() => showToast("삭제 실패", "error"));
      });
    });
    card.addEventListener("click", () => openVideoModal(ip, j.id, name));
    timelapseGrid.appendChild(card);
  });
}

async function loadPrinterInfo(ip) {
  infoLoaded = ip;
  historyContent.innerHTML = '<div class="info-loading">불러오는 중…</div>';
  timelapseGrid.innerHTML  = '<div class="info-loading">불러오는 중…</div>';

  let data = null;
  try {
    const r = await fetch(`/api/history/${ip}`);
    data = await r.json();
  } catch(e) {}

  renderHistory(data);
  renderTimelapse(data, ip);
}

infoBtn.addEventListener("click", () => {
  if (currentIndex < 0) return;
  const ip = allViewers[currentIndex]?.dataset.ip;
  if (!ip) return;
  if (focusInfoPanel.classList.contains("visible")) {
    isInfoOpen = false;
    focusInfoPanel.classList.remove("visible");
    infoBtn.classList.remove("pin-active");
    if (!isPinned) startAutoSlide();
  } else {
    isInfoOpen = true;
    focusInfoPanel.classList.add("visible");
    infoBtn.classList.add("pin-active");
    stopAutoSlide();
    loadPrinterInfo(ip);
  }
});

document.querySelectorAll(".info-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".info-tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    historyContent.classList.toggle("hidden",   tab !== "history");
    timelapseContent.classList.toggle("hidden", tab !== "timelapse");
  });
});

/* ══════════════════════════════════════════
   FILE MODAL
══════════════════════════════════════════ */
function openFileModal() {
  if (currentIndex < 0) return;
  const ip = allViewers[currentIndex]?.dataset.ip;
  if (!ip) return;
  isFileOpen = true;
  stopAutoSlide();
  fileModal.classList.add("visible");
  fileModalBody.innerHTML = '<div class="info-loading">불러오는 중…</div>';

  fetch(`/api/files/${ip}`)
    .then(r => r.json())
    .then(data => renderFileList(data, ip))
    .catch(() => { fileModalBody.innerHTML = '<div class="info-empty">불러오기 실패</div>'; });
}

function closeFileModal() {
  isFileOpen = false;
  fileModal.classList.remove("visible");
  if (!isPinned && !isInfoOpen) startAutoSlide();
}

function addFileRow(container, ip, path, filename, size, duration) {
  const meta = [size, duration].filter(Boolean).join(" · ");
  const idx  = container.children.length;
  const row  = document.createElement("div");
  row.className = "file-row";
  row.style.animationDelay = `${Math.min(idx * 30, 300)}ms`;
  row.innerHTML = `
    <div class="file-row-name" title="${filename}">${filename}</div>
    <div class="file-row-meta">${meta}</div>
    <button class="file-print-btn">▶ 출력</button>`;
  row.querySelector(".file-print-btn").addEventListener("click", function() {
    const btn = this;
    showConfirm(`"${filename}" 출력을 시작할까요?`, () => {
      btn.disabled    = true;
      btn.textContent = "전송 중…";
      fetch(`/api/files/${ip}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, filename })
      })
      .then(r => r.json())
      .then(() => { btn.textContent = "✓ 전송됨"; setTimeout(closeFileModal, 800); })
      .catch(() => { btn.disabled = false; btn.textContent = "▶ 출력"; showToast("전송 실패", "error"); });
    });
  });
  container.appendChild(row);
}

function renderFileList(data, ip) {
  fileModalBody.innerHTML = "";

  const infoA = data?.retGcodeFileInfo?.fileInfo;
  if (typeof infoA === "string" && infoA.trim()) {
    infoA.split(";").filter(Boolean).map(e => e.split(":")).forEach(f => {
      const path = f[0] || "", filename = f[1] || "";
      if (!filename.toLowerCase().endsWith(".gcode")) return;
      addFileRow(fileModalBody, ip, path, filename, fmtSize(parseInt(f[2])), fmtSecs(f[5]));
    });
  } else if (Array.isArray(data?.retGcodeFileInfo2)) {
    data.retGcodeFileInfo2.forEach(f => {
      const filename = f.name || "";
      if (!filename.toLowerCase().endsWith(".gcode")) return;
      const dir = (f.path || "").split("/").slice(0, -1).join("/");
      addFileRow(fileModalBody, ip, dir, filename, fmtSize(f.file_size || 0), fmtSecs(f.timeCost || 0));
    });
  } else {
    fileModalBody.innerHTML = '<div class="info-empty">파일 목록을 가져올 수 없습니다</div>';
    return;
  }

  if (!fileModalBody.children.length) {
    fileModalBody.innerHTML = '<div class="info-empty">gcode 파일이 없습니다</div>';
  }
}

fileModalClose.addEventListener("click", closeFileModal);
fileModalOverlay.addEventListener("click", closeFileModal);
printFileBtn.addEventListener("click", openFileModal);

/* ══════════════════════════════════════════
   VIDEO MODAL
══════════════════════════════════════════ */
function openVideoModal(ip, vidId, filename) {
  videoModalTitle.textContent = filename || `${vidId}.mp4`;
  videoPlayer.src = `/api/timelapse/${ip}/video/${vidId}`;
  videoModal.classList.add("visible");
  videoPlayer.play().catch(() => {});
}

function closeVideoModal() {
  if (!document.pictureInPictureElement) {
    videoPlayer.pause();
    videoPlayer.src = "";
  }
  videoModal.classList.remove("visible");
}

videoPlayer.addEventListener("leavepictureinpicture", () => {
  videoPlayer.pause();
  videoPlayer.src = "";
});

videoModalClose.addEventListener("click", closeVideoModal);
videoModalOverlay.addEventListener("click", closeVideoModal);

videoPipBtn.addEventListener("click", async () => {
  if (!document.pictureInPictureEnabled) {
    showToast("이 브라우저는 PIP를 지원하지 않습니다", "error");
    return;
  }
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else {
      await videoPlayer.requestPictureInPicture();
      closeVideoModal();
    }
  } catch (e) {
    showToast("PIP 전환에 실패했습니다", "error");
  }
});

/* ══════════════════════════════════════════
   LIVE STREAM PIP
══════════════════════════════════════════ */
let pipRafId      = null;
let pipVid        = null;
let pipPrevPinned = false;

function stopLivePip() {
  if (pipRafId) { cancelAnimationFrame(pipRafId); pipRafId = null; }
  if (pipVid)   { pipVid.remove(); pipVid = null; }
  setPinned(pipPrevPinned);
}

async function startLivePip() {
  if (!document.pictureInPictureEnabled) {
    showToast("이 브라우저는 PIP를 지원하지 않습니다", "error");
    return;
  }
  if (document.pictureInPictureElement) {
    await document.exitPictureInPicture();
    return;
  }

  const label = focusTitle.textContent || "";

  const canvas = document.createElement("canvas");
  const w = focusImg.naturalWidth  || 640;
  const h = focusImg.naturalHeight || 480;
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  function drawFrame() {
    ctx.drawImage(focusImg, 0, 0, w, h);
    const fontSize = Math.max(16, Math.round(h * 0.045));
    const barH     = Math.round(fontSize * 1.9);
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, w, barH);
    ctx.fillStyle    = "#fff";
    ctx.font         = `600 ${fontSize}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText(label, fontSize * 0.6, barH / 2);
  }

  // 첫 프레임 먼저 그려야 stream이 유효해짐
  drawFrame();

  const v = document.createElement("video");
  v.muted = true;
  v.style.cssText = "position:fixed;left:-9999px;width:1px;height:1px;";
  v.srcObject = canvas.captureStream(30);
  document.body.appendChild(v);
  pipVid = v;

  await new Promise(r => v.addEventListener("canplay", r, { once: true }));
  await v.play();

  function draw() {
    if (!document.pictureInPictureElement) { stopLivePip(); return; }
    drawFrame();
    pipRafId = requestAnimationFrame(draw);
  }

  v.addEventListener("leavepictureinpicture", stopLivePip, { once: true });

  try {
    await v.requestPictureInPicture();
    draw();
  } catch (e) {
    showToast("PIP 전환에 실패했습니다", "error");
    stopLivePip();
  }
}

livePipBtn.addEventListener("click", startLivePip);

/* ══════════════════════════════════════════
   KEYBOARD & GLOBAL EVENTS
══════════════════════════════════════════ */
function setPinned(pinned) {
  isPinned = pinned;
  if (isPinned) {
    pinBtn.classList.add("pin-active");
    pinBtn.textContent = "🔓 해제";
    stopAutoSlide();
  } else {
    pinBtn.classList.remove("pin-active");
    pinBtn.textContent = "🔒 고정";
    startAutoSlide();
  }
}

pinBtn.addEventListener("click", () => setPinned(!isPinned));

allViewers.forEach(v => {
  v.addEventListener("click", () => {
    if (v.classList.contains("broken")) return;
    openFocus(v);
  });
});

closeBtn.addEventListener("click", closeFocus);

// Escape 처리 (캡처 페이즈 — 모달 우선)
window.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (videoModal.classList.contains("visible")) {
    closeVideoModal();
    return;
  }
  if (isFileOpen) {
    closeFileModal();
    return;
  }
  if (currentIndex !== -1) closeFocus();
}, true);

// 방향키 탐색
window.addEventListener("keydown", e => {
  if (currentIndex === -1) return;
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;

  const curViewer = allViewers[currentIndex];
  let cur = activeViewers.indexOf(curViewer);
  if (cur === -1) cur = 0;

  const direction = e.key === "ArrowRight" ? "left" : "right";
  cur = e.key === "ArrowRight"
    ? (cur + 1) % activeViewers.length
    : (cur - 1 + activeViewers.length) % activeViewers.length;

  openFocus(activeViewers[cur], direction);
  scrollToViewer(activeViewers[cur]);
});

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
allViewers.forEach(v => startThumbPoll(v));
setTimeout(pollStatuses, 1500);
setInterval(pollStatuses, STATUS_MS);

// 새로고침 전에 확대해서 보고 있던 프린터가 있으면 그대로 복원
(function restoreFocus() {
  const savedIp = localStorage.getItem(FOCUS_IP_KEY);
  if (!savedIp) return;
  const viewer = activeViewers.find(v => v.dataset.ip === savedIp);
  if (viewer) openFocus(viewer);
})();
