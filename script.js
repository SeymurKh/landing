/* ─── Config ─────────────────────────────────────────────────────────── */

const CHANNEL_ID = "UCa9kWM8BbmFi5OpXbjyqk9w";
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

/* Data sources — fetched IN PARALLEL */
const DATA_SOURCES = [
  {
    name: "AllOrigins",
    url: `https://api.allorigins.win/get?url=${encodeURIComponent(RSS_URL)}`,
    async parse(json) {
      if (!json.contents) throw new Error("No contents");
      return parseYouTubeXml(json.contents);
    },
  },
  {
    name: "rss2json",
    url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`,
    parse(json) {
      if (!json.items?.length) throw new Error("No items");
      return json.items.slice(0, 6).map((item) => ({
        id: extractVideoId(item.link),
        title: item.title,
        url: item.link,
        thumbnail: item.thumbnail || item.enclosure?.link || "",
        published: item.pubDate,
      }));
    },
  },
];

/*
 * Live streams — UPDATE MANUALLY after each new stream.
 * YouTube RSS does NOT distinguish streams from regular videos,
 * so we keep a list of stream IDs to filter them OUT of "Latest Videos"
 * and show them ONLY in the "Streams" section.
 */
const STREAMS = [
  { id: "RJtt_Jd9Uns", title: "RADIO 24/7 | Downtempo for Coding, Work & Inner Flow", url: "https://www.youtube.com/live/RJtt_Jd9Uns", thumbnail: "https://i.ytimg.com/vi/RJtt_Jd9Uns/hqdefault.jpg" },
];

const STREAM_IDS = new Set(STREAMS.map((s) => s.id));

/* ─── DOM refs ───────────────────────────────────────────────────────── */

const $videoList    = document.getElementById("videoList");
const $videoFlyout  = document.getElementById("videoFlyout");
const $liveList     = document.getElementById("liveList");
const $liveFlyout   = document.getElementById("liveFlyout");
const $preloader    = document.getElementById("preloader");
const $preloaderBar = document.getElementById("preloaderBar");
const $preloaderPct = document.getElementById("preloaderPercent");

/* ─── Helpers ────────────────────────────────────────────────────────── */

function coverUrl(id) { return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; }

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|\/videos\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : "";
}

function parseYouTubeXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const entries = [...doc.querySelectorAll("entry")];
  if (!entries.length) throw new Error("No entries in XML");
  return entries.map((e) => {
    const id = e.querySelector("videoId")?.textContent || "";
    return { id, title: e.querySelector("title")?.textContent || "", url: `https://youtu.be/${id}`, thumbnail: coverUrl(id), published: e.querySelector("published")?.textContent || "" };
  });
}

/* Cache (5 min TTL) */
const CACHE_KEY = "essk_v7";
const CACHE_TTL = 5 * 60 * 1000;

function cacheGet(key, ttl) {
  try { const { ts, data } = JSON.parse(localStorage.getItem(key) || "{}"); return Date.now() - ts < ttl ? data : null; } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

/* ─── Data fetching ──────────────────────────────────────────────────── */

function filterOutStreams(videos) {
  const filtered = videos.filter((v) => !STREAM_IDS.has(v.id));
  if (filtered.length < videos.length) console.log(`[EssKey] Filtered ${videos.length - filtered.length} stream(s)`);
  return filtered;
}

async function trySource(src) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(src.url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    let videos = await src.parse(data);
    if (!videos.length) throw new Error("No videos");
    videos = filterOutStreams(videos);
    if (!videos.length) throw new Error("Only streams");
    console.log(`[EssKey] ${src.name} OK — ${videos.length} videos`);
    return videos;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[EssKey] ${src.name} failed:`, err.message);
    throw err;
  }
}

async function fetchYouTubeVideos() {
  /* Try cache first */
  const cached = cacheGet(CACHE_KEY, CACHE_TTL);
  if (cached?.length) {
    console.log(`[EssKey] Using cache (${Math.round(CACHE_TTL / 60000)}min TTL)`);
    return cached;
  }
  /* Fetch all in parallel */
  const results = await Promise.all(DATA_SOURCES.map((s) => trySource(s).catch(() => null)));
  for (const r of results) if (r) { cacheSet(CACHE_KEY, r); return r; }
  throw new Error("All sources failed");
}

/* ─── Skeleton loader ────────────────────────────────────────────────── */

function renderSkeletons(container, count) {
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "skeleton-card";
    container.appendChild(s);
  }
}

function clearSkeletons(container) {
  container.querySelectorAll(".skeleton-card").forEach((s) => s.remove());
}

/* ─── Render helpers ─────────────────────────────────────────────────── */

function appendFlyoutLink(flyout, { title, url }) {
  const a = document.createElement("a");
  a.className = "flyout-link"; a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = title;
  flyout.appendChild(a);
}

function appendMediaCard(container, { id, title, url, thumbnail }) {
  const bg = thumbnail || coverUrl(id);
  const card = document.createElement("article");
  card.className = "media-card reveal";
  card.style.setProperty("--bg", `url('${bg}')`);
  card.addEventListener("click", () => window.open(url, "_blank", "noopener"));
  card.insertAdjacentHTML("beforeend", `<div class="media-card-body"><h3 class="media-title">${title}</h3><a class="btn btn-line" href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Watch</a></div>`);
  container.appendChild(card);
  observeReveal(card);
}

function renderVideos(videos) {
  clearSkeletons($videoList);
  $videoList.innerHTML = "";
  if ($videoFlyout) $videoFlyout.innerHTML = "";
  for (const v of videos) { appendMediaCard($videoList, v); if ($videoFlyout) appendFlyoutLink($videoFlyout, v); }
}

function renderStreams(streams) {
  if ($liveList && !streams.length) { $liveList.innerHTML = '<p class="live-empty">No active streams</p>'; return; }
  $liveList.innerHTML = "";
  if ($liveFlyout) $liveFlyout.innerHTML = "";
  for (const s of streams) { appendMediaCard($liveList, s); if ($liveFlyout) appendFlyoutLink($liveFlyout, s); }
}

/* ─── Reveal animation ──────────────────────────────────────────────── */

const revealObs = new IntersectionObserver((entries) => {
  for (const e of entries) { if (e.isIntersecting) { e.target.classList.add("is-visible"); revealObs.unobserve(e.target); } }
}, { threshold: 0.1 });

function observeReveal(el) { revealObs.observe(el); }

document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i * 50, 200)}ms`;
  revealObs.observe(el);
});

/* ─── Background video (lazy) ────────────────────────────────────────── */

const $bgVideo = document.querySelector(".page-bg-video");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let bgVideoInit = false;

function initBgVideo() {
  if (bgVideoInit || !$bgVideo || reducedMotion) return;
  bgVideoInit = true;
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn?.saveData || /(?:^|slow-)2g/.test(conn?.effectiveType || "")) return;
  const src = $bgVideo.dataset.src;
  if (!src) return;
  const s = document.createElement("source"); s.src = src; s.type = "video/mp4";
  $bgVideo.appendChild(s); $bgVideo.load();
  $bgVideo.play().catch(() => {
    const retry = () => $bgVideo.play().catch(() => {});
    document.addEventListener("touchstart", retry, { once: true, passive: true });
    document.addEventListener("click", retry, { once: true, passive: true });
  });
}

/* ─── Contact form ───────────────────────────────────────────────────── */

const $form = document.getElementById("contactForm");
const $status = document.getElementById("formStatus");

if ($form && $status) {
  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $form.querySelector("#name").value.trim();
    const email = $form.querySelector("#email").value.trim();
    const msg = $form.querySelector("#message").value.trim();
    if (name.length < 2) { $status.textContent = "Please enter your name."; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $status.textContent = "Please enter a valid email."; return; }
    if (msg.length < 8) { $status.textContent = "Please add a short message."; return; }
    const subj = encodeURIComponent(`EssKey Music Contact Form — ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}`);
    window.location.href = `mailto:EssKey_YTB@protonmail.com?subject=${subj}&body=${body}`;
    $status.textContent = "Your email app is opening with a pre-filled message.";
    $form.reset();
  });
}

/* ─── Featured YouTube player ────────────────────────────────────────── */

const $playerHost = document.getElementById("featuredPlayer");
const $playerFallback = document.getElementById("playerFallback");
const $playerPlayBtn = document.getElementById("playerPlayBtn");

let ytPlayer = null;
let didStartPlay = false;
let pendingVideoId = null;
let videoQueue = [];
let currentVideoIndex = -1;

function updateFeatured(videoId, videoUrl) {
  if ($playerFallback) { $playerFallback.href = videoUrl; $playerFallback.classList.remove("is-visible"); }
  if (ytPlayer?.loadVideoById) {
    ytPlayer.loadVideoById(videoId);
  } else {
    pendingVideoId = videoId;
  }
}

function tryNextVideo() {
  currentVideoIndex++;
  if (currentVideoIndex >= videoQueue.length) {
    $playerFallback?.classList.add("is-visible");
    return;
  }
  updateFeatured(videoQueue[currentVideoIndex].id, videoQueue[currentVideoIndex].url);
}

if ($playerHost) {
  $playerPlayBtn?.addEventListener("click", () => {
    if (!ytPlayer) { ensureYouTubeApi(); return; }
    ytPlayer.mute(); ytPlayer.playVideo();
  });
}

let ytApiRequested = false, ytPlayerBooted = false;

function bootYouTubePlayer() {
  if (ytPlayerBooted || !window.YT?.Player) return;
  ytPlayerBooted = true;
  const startId = videoQueue.length > 0 ? videoQueue[0].id : pendingVideoId;
  if (!startId) { $playerFallback?.classList.add("is-visible"); return; }

  ytPlayer = new window.YT.Player("featuredPlayer", {
    videoId: startId,
    playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1, modestbranding: 1 },
    events: {
      onReady(e) { e.target.mute(); e.target.playVideo(); },
      onStateChange(e) {
        const S = window.YT.PlayerState;
        if (e.data === S.PLAYING) { didStartPlay = true; $playerFallback?.classList.remove("is-visible"); $playerPlayBtn?.classList.remove("is-visible"); }
        else if (e.data === S.PAUSED || e.data === S.UNSTARTED) { $playerPlayBtn?.classList.add("is-visible"); }
      },
      onError() { tryNextVideo(); },
    },
  });

  setTimeout(() => { if (!didStartPlay) { $playerFallback?.classList.add("is-visible"); $playerPlayBtn?.classList.add("is-visible"); } }, 3000);
}

function ensureYouTubeApi() {
  if (ytApiRequested) return;
  ytApiRequested = true;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => bootYouTubePlayer();
}

function initPlayerLazy() {
  if (!$playerHost) return;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries, o) => { if (entries.some((e) => e.isIntersecting)) { ensureYouTubeApi(); o.disconnect(); } }, { rootMargin: "300px 0px" }).observe($playerHost);
  } else {
    setTimeout(() => ensureYouTubeApi(), 500);
  }
}

/* ─── Bootstrap ──────────────────────────────────────────────────────── */

/* 1. Show skeletons while loading */
renderSkeletons($videoList, 6);
renderStreams(STREAMS);

/* 2. Fetch videos */
const videosPromise = fetchYouTubeVideos()
  .then((videos) => {
    console.log(`[EssKey] Loaded ${videos.length} videos. Latest: "${videos[0]?.title}" (${videos[0]?.id})`);
    renderVideos(videos);
    videoQueue = videos;
    currentVideoIndex = 0;
    if (videos[0]) updateFeatured(videos[0].id, videos[0].url);
    return videos;
  })
  .catch((err) => {
    console.warn("[EssKey] All sources failed:", err.message);
    clearSkeletons($videoList);
    $videoList.innerHTML = '<p class="live-empty">Unable to load videos. Try refreshing.</p>';
    return [];
  });

/* 3. Minimal preloader (fonts + data) */
(function runPreloader(promise) {
  if (!$preloader || !$preloaderBar || !$preloaderPct) { document.body.classList.remove("is-loading"); return; }
  let current = 0, target = 30;
  const tick = () => {
    current += (target - current) * 0.15;
    if (target - current < 0.5) current = target;
    const pct = Math.round(Math.min(100, current));
    $preloaderBar.style.width = `${pct}%`;
    $preloaderPct.textContent = `${pct}%`;
    if (pct < 100) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  target = 60;
  const ready = Promise.allSettled([
    document.fonts?.ready?.then(() => { target = Math.max(target, 85); }) ?? Promise.resolve(),
    promise.finally(() => { target = 100; }),
  ]).then(() => new Promise((r) => setTimeout(r, 120)));
  const hardStop = new Promise((r) => setTimeout(() => { target = 100; setTimeout(r, 120); }, 1200));
  Promise.race([ready, hardStop]).then(() => {
    $preloader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
  });
})(videosPromise);

/* 4. Init heavy resources after preloader */
videosPromise.then(() => {
  initBgVideo();
  initPlayerLazy();
});
