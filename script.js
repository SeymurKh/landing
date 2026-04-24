/* ─── Config ─────────────────────────────────────────────────────────── */

const CHANNEL_ID = "UCa9kWM8BbmFi5OpXbjyqk9w";
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

/* Multiple data sources — tried in order until one works */
const DATA_SOURCES = [
  /* 1. rss2json.com — free, CORS-enabled */
  {
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
  /* 2. AllOrigins CORS proxy */
  {
    url: `https://api.allorigins.win/get?url=${encodeURIComponent(RSS_URL)}`,
    async parse(json) {
      if (!json.contents) throw new Error("No contents");
      return parseYouTubeXml(json.contents);
    },
  },
  /* 3. corsproxy.io */
  {
    url: `https://corsproxy.io/?url=${encodeURIComponent(RSS_URL)}`,
    async parse(text) {
      return parseYouTubeXml(text);
    },
  },
];

/* Fallback — shown instantly while API loads */
const FALLBACK_VIDEOS = [
  { id: "Z8axMWvzUrE", title: "DEEP FOCUS PROTOCOL | Lo-fi Flow for Creations & Coding", url: "https://youtu.be/Z8axMWvzUrE", thumbnail: "https://i.ytimg.com/vi/Z8axMWvzUrE/hqdefault.jpg" },
  { id: "K5js77szFVM", title: "Deep Focus Frequency | Downtempo for Coding, Work & Inner Flow", url: "https://youtu.be/K5js77szFVM", thumbnail: "https://i.ytimg.com/vi/K5js77szFVM/hqdefault.jpg" },
  { id: "SO1pmKFicTE", title: "Enter The Flow State | Ambient for Deep Work & Late-Night Thinking", url: "https://youtu.be/SO1pmKFicTE", thumbnail: "https://i.ytimg.com/vi/SO1pmKFicTE/hqdefault.jpg" },
];

/*
 * Live streams — UPDATE MANUALLY after each new stream.
 * YouTube RSS does NOT distinguish streams from regular videos,
 * so we keep a list of stream IDs to filter them OUT of "Latest Videos"
 * and show them ONLY in the "Streams" section.
 *
 * To add a new stream: add it here with id, title, url, thumbnail.
 */
const STREAMS = [
  { id: "RJtt_Jd9Uns", title: "RADIO 24/7 | Downtempo for Coding, Work & Inner Flow", url: "https://www.youtube.com/live/RJtt_Jd9Uns", thumbnail: "https://i.ytimg.com/vi/RJtt_Jd9Uns/hqdefault.jpg" },
];

/* IDs that should ONLY appear in Streams, never in Latest Videos */
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

function cacheGet(key, ttl) {
  try { const { ts, data } = JSON.parse(localStorage.getItem(key) || "{}"); return Date.now() - ts < ttl ? data : null; } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

/* Clear ALL old cache */
["essk_videos", "essk_videos_v2", "essk_videos_v3", "essk_v4"].forEach((k) => { try { localStorage.removeItem(k); } catch {} });

/* ─── Data fetching ──────────────────────────────────────────────────── */

/* Remove streams from video list — they go to the Streams section only */
function filterOutStreams(videos) {
 const filtered = videos.filter((v) => !STREAM_IDS.has(v.id));
 const removed = videos.length - filtered.length;
 if (removed > 0) console.log(`[EssKey] Filtered out ${removed} stream(s) from Videos → Streams only`);
 return filtered;
}

async function fetchYouTubeVideos() {
  for (let i = 0; i < DATA_SOURCES.length; i++) {
    const src = DATA_SOURCES[i];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const res = await fetch(src.url, { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      let videos = await src.parse(data);
      if (videos.length > 0) {
        /* Remove streams — they appear only in Streams section */
        videos = filterOutStreams(videos);
        if (videos.length > 0) {
          console.log(`[EssKey] Source #${i + 1} OK — ${videos.length} videos (no streams)`);
          return videos;
        }
      }
    } catch (err) {
      clearTimeout(timer);
      console.warn(`[EssKey] Source #${i + 1} failed:`, err.message);
    }
  }
  throw new Error("All sources failed");
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
  $videoList.innerHTML = "";
  if ($videoFlyout) $videoFlyout.innerHTML = "";
  for (const v of videos) { appendMediaCard($videoList, v); if ($videoFlyout) appendFlyoutLink($videoFlyout, v); }
}

function renderStreams(streams) {
  $liveList.innerHTML = "";
  if ($liveFlyout) $liveFlyout.innerHTML = "";
  for (const s of streams) { appendMediaCard($liveList, s); if ($liveFlyout) appendFlyoutLink($liveFlyout, s); }
}

/* ─── Reveal animation ──────────────────────────────────────────────── */

const revealObs = new IntersectionObserver((entries) => {
  for (const e of entries) { if (e.isIntersecting) { e.target.classList.add("is-visible"); revealObs.unobserve(e.target); } }
}, { threshold: 0.12 });

function observeReveal(el) { revealObs.observe(el); }

document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i * 60, 280)}ms`;
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
let videoQueue = [];        /* videos to try in player */
let currentVideoIndex = -1; /* which video we're currently trying */

function updateFeatured(videoId, videoUrl) {
  if ($playerFallback) $playerFallback.href = videoUrl;
  if (ytPlayer?.loadVideoById) {
    ytPlayer.loadVideoById(videoId);
    console.log(`[EssKey] Player loading: ${videoId}`);
  } else {
    pendingVideoId = videoId;
    console.log(`[EssKey] Pending video: ${videoId} (player not ready)`);
  }
}

/* Try next video in queue if current one fails */
function tryNextVideo() {
  currentVideoIndex++;
  if (currentVideoIndex >= videoQueue.length) {
    console.warn("[EssKey] No more videos to try in player");
    $playerFallback?.classList.add("is-visible");
    return;
  }
  const v = videoQueue[currentVideoIndex];
  console.log(`[EssKey] Trying video ${currentVideoIndex + 1}/${videoQueue.length}: "${v.title}" (${v.id})`);
  updateFeatured(v.id, v.url);
}

if ($playerHost) {
  $playerPlayBtn?.addEventListener("click", () => {
    if (!ytPlayer) { ensureYouTubeApi(); return; }
    ytPlayer.mute();
    ytPlayer.playVideo();
  });
}

let ytApiRequested = false;
let ytPlayerBooted = false;

function bootYouTubePlayer() {
  if (ytPlayerBooted || !window.YT?.Player) return;
  ytPlayerBooted = true;

  /* Use first video from queue, or pending, or fallback */
  const startId = videoQueue.length > 0 ? videoQueue[0].id : pendingVideoId || FALLBACK_VIDEOS[0].id;

  ytPlayer = new window.YT.Player("featuredPlayer", {
    videoId: startId,
    playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1, modestbranding: 1 },
    events: {
      onReady(e) {
        console.log("[EssKey] Player ready");
        e.target.mute();
        e.target.playVideo();
      },
      onStateChange(e) {
        const S = window.YT.PlayerState;
        if (e.data === S.PLAYING) {
          didStartPlay = true;
          $playerFallback?.classList.remove("is-visible");
          $playerPlayBtn?.classList.remove("is-visible");
        } else if (e.data === S.PAUSED || e.data === S.UNSTARTED) {
          $playerPlayBtn?.classList.add("is-visible");
        }
      },
      /* If video is unplayable (live stream, private, etc.), try next one */
      onError(e) {
        console.warn(`[EssKey] Player error code ${e.data} for video ${currentVideoIndex + 1} — trying next`);
        tryNextVideo();
      },
    },
  });

  /* Show fallback button if nothing plays after 3s */
  setTimeout(() => {
    if (!didStartPlay) {
      $playerFallback?.classList.add("is-visible");
      $playerPlayBtn?.classList.add("is-visible");
    }
  }, 3000);
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
    const obs = new IntersectionObserver(
      (entries, o) => { if (entries.some((e) => e.isIntersecting)) { ensureYouTubeApi(); o.disconnect(); } },
      { rootMargin: "200px 0px" }
    );
    obs.observe($playerHost);
  } else {
    setTimeout(() => ensureYouTubeApi(), 400);
  }
}

/* ─── Bootstrap ──────────────────────────────────────────────────────── */

/* 1. Show fallback immediately */
renderVideos(FALLBACK_VIDEOS);
renderStreams(STREAMS);

/* 2. Fetch latest videos and set up everything */
const CACHE_KEY = "essk_v4";

const videosPromise = fetchYouTubeVideos()
  .then((videos) => {
    console.log(`[EssKey] Loaded ${videos.length} videos. Latest: "${videos[0].title}" (${videos[0].id})`);

    /* Render all videos in the grid */
    renderVideos(videos);
    cacheSet(CACHE_KEY, videos);

    /* Set up video queue for featured player */
    videoQueue = videos;
    currentVideoIndex = 0;

    /* Update featured player with first video */
    updateFeatured(videos[0].id, videos[0].url);

    return videos;
  })
  .catch((err) => {
    console.warn("[EssKey] All sources failed:", err.message);
    const cached = cacheGet(CACHE_KEY, 30 * 60 * 1000);
    if (cached?.length) {
      console.log(`[EssKey] Using cache: "${cached[0].title}"`);
      renderVideos(cached);
      videoQueue = cached;
      currentVideoIndex = 0;
      updateFeatured(cached[0].id, cached[0].url);
      return cached;
    }
    console.log(`[EssKey] Using fallback: "${FALLBACK_VIDEOS[0].title}"`);
    videoQueue = FALLBACK_VIDEOS;
    currentVideoIndex = 0;
    updateFeatured(FALLBACK_VIDEOS[0].id, FALLBACK_VIDEOS[0].url);
    return FALLBACK_VIDEOS;
  });

/* 3. Preloader */
(function runPreloader(promise) {
  if (!$preloader || !$preloaderBar || !$preloaderPct) { document.body.classList.remove("is-loading"); return; }
  let current = 0, target = 6;
  const start = performance.now(), minMs = 700, maxMs = 1800;
  const tick = () => {
    current += (target - current) * 0.12;
    if (target - current < 0.3) current = target;
    const pct = Math.round(Math.min(100, current));
    $preloaderBar.style.width = `${pct}%`;
    $preloaderPct.textContent = `${pct}%`;
    if (pct < 100) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  target = 35;
  const fontsReady = (document.fonts?.ready?.then(() => { target = Math.max(target, 68); }) ?? Promise.resolve());
  const videosReady = promise.finally(() => { target = Math.max(target, 90); });
  const ready = Promise.allSettled([fontsReady, videosReady]).then(() => {
    const wait = Math.max(0, minMs - (performance.now() - start));
    return new Promise((r) => setTimeout(() => { target = 100; setTimeout(r, 180); }, wait));
  });
  const hardStop = new Promise((r) => setTimeout(() => { target = 100; setTimeout(r, 180); }, maxMs));
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
