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
 * Streams — HARDCODED. Update this list manually when new streams go live.
 * YouTube RSS cannot distinguish streams from regular videos.
 */
const STREAMS = [
  { id: "RJtt_Jd9Uns", title: "RADIO 24/7 | Downtempo for Coding, Work & Inner Flow", url: "https://www.youtube.com/live/RJtt_Jd9Uns", thumbnail: "https://i.ytimg.com/vi/RJtt_Jd9Uns/hqdefault.jpg" },
  { id: "Y0BSnmYRh_8", title: "RADIO 24/7! Organic House For Deep working, Art & Design Works", url: "https://www.youtube.com/live/Y0BSnmYRh_8", thumbnail: "https://i.ytimg.com/vi/Y0BSnmYRh_8/hqdefault.jpg" },
];

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

/* Cache */
const CACHE_KEY = "essk_v11";
const CACHE_TTL = 3 * 60 * 1000;

function cacheGet(key, ttl) {
  try { const { ts, data } = JSON.parse(localStorage.getItem(key) || "{}"); return Date.now() - ts < ttl ? data : null; } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

/* ─── Data fetching ──────────────────────────────────────────────────── */

async function trySource(src) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(src.url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const videos = await src.parse(data);
    if (!videos.length) throw new Error("No videos");
    console.log(`[EssKey] ${src.name} OK — ${videos.length} videos`);
    return videos;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[EssKey] ${src.name} failed:`, err.message);
    throw err;
  }
}

async function fetchYouTubeVideos() {
  const cached = cacheGet(CACHE_KEY, CACHE_TTL);
  if (cached?.length) {
    console.log(`[EssKey] Using cache (${Math.round(CACHE_TTL / 60000)}min TTL)`);
    return cached;
  }
  const results = await Promise.all(DATA_SOURCES.map((s) => trySource(s).catch(() => null)));
  for (const r of results) if (r) {
    /* Filter out streams — all start with "RADIO 24/7" */
    const filtered = r.filter((v) => !v.title.toUpperCase().startsWith("RADIO 24/7"));
    if (filtered.length) { cacheSet(CACHE_KEY, filtered); return filtered; }
  }
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

/* ─── Background video (lazy, NOT blocking) ──────────────────────────── */

const $pageBg = document.querySelector(".page-bg");
const $bgVideo = document.querySelector(".page-bg-video");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initBgVideo() {
  if (!$bgVideo || reducedMotion) return;
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

/* ─── YouTube IFrame API — preload during preloader ─────────────────── */

const $playerHost = document.getElementById("featuredPlayer");
const $playerFallback = document.getElementById("playerFallback");
const $playerPlayBtn = document.getElementById("playerPlayBtn");

let ytPlayer = null;
let playerReady = false;
let latestVideos = [];

/*
 * Preload the YouTube IFrame API script.
 * Resolves when window.YT.Player is available.
 */
const ytApiReady = new Promise((resolve) => {
  /* Already loaded (rare — script in cache from previous visit) */
  if (window.YT && window.YT.Player && window.YT.Player.prototype.loadVideoById) {
    resolve();
    return;
  }
  /* Global callback that YouTube's iframe_api script calls */
  window.onYouTubeIframeAPIReady = function () {
    console.log("[EssKey] YouTube IFrame API ready");
    resolve();
  };
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  tag.async = true;
  document.head.appendChild(tag);
  /* Safety: if the global callback never fires within 4s, resolve anyway */
  setTimeout(resolve, 4000);
});

/* Show play button immediately — acts as tap-to-play fallback */
if ($playerPlayBtn) $playerPlayBtn.classList.add("is-visible");

function bootPlayer(videoId, videoUrl) {
  if (!$playerHost || ytPlayer) return;
  if ($playerFallback) $playerFallback.href = videoUrl;

  ytApiReady.then(() => {
    /* Ensure the host element still exists ( YT.Player replaces it ) */
    const el = document.getElementById("featuredPlayer");
    if (!el) return;

    ytPlayer = new YT.Player("featuredPlayer", {
      width: "100%",
      height: "100%",
      videoId: videoId,
      playerVars: {
        autoplay: 1,
        mute: 1,
        controls: 1,
        rel: 0,
        playsinline: 1,
        modestbranding: 1,
        origin: location.origin,
      },
      events: {
        onReady: function (e) {
          playerReady = true;
          console.log("[EssKey] YT player ready — calling playVideo()");
          e.target.playVideo();
          /* Hide play button, show YouTube fallback link */
          if ($playerPlayBtn) $playerPlayBtn.classList.remove("is-visible");
          if ($playerFallback) $playerFallback.classList.add("is-visible");
        },
        onError: function (e) {
          console.warn("[EssKey] YT player error code:", e.data);
          /* Show play button so user can tap on mobile */
          if ($playerPlayBtn) $playerPlayBtn.classList.add("is-visible");
        },
        onStateChange: function (e) {
          /* YT.PlayerState.PLAYING === 1 */
          if (e.data === 1) {
            if ($playerPlayBtn) $playerPlayBtn.classList.remove("is-visible");
            if ($playerFallback) $playerFallback.classList.add("is-visible");
          }
          /* YT.PlayerState.PAUSED or ENDED — show play btn on mobile */
          if (e.data === 2 || e.data === 0) {
            if ($playerPlayBtn) $playerPlayBtn.classList.add("is-visible");
          }
        },
      },
    });
  });
}

/* Manual play button — user gesture = guaranteed autoplay everywhere */
if ($playerPlayBtn) {
  $playerPlayBtn.addEventListener("click", () => {
    if (!latestVideos.length) return;
    const v = latestVideos[0];
    if (playerReady && ytPlayer) {
      ytPlayer.playVideo();
      $playerPlayBtn.classList.remove("is-visible");
    } else {
      bootPlayer(v.id, v.url);
    }
  });
}

/* ─── Preloader — smooth milestone-based ────────────────────────────── */

function runPreloader(fontsReady, dataReady) {
  if (!$preloader || !$preloaderBar || !$preloaderPct) {
    document.body.classList.remove("is-loading");
    return Promise.resolve([]);
  }

  let pct = 0;
  let finished = false;
  let resolveFn;
  const done = new Promise((r) => { resolveFn = r; });

  function setPct(v) {
    pct = Math.round(Math.min(v, 100));
    $preloaderBar.style.width = pct + "%";
    $preloaderPct.textContent = pct + "%";
  }

  function finish(videos) {
    if (finished) return;
    finished = true;
    setPct(100);
    /* Start CSS fade-out, then wait well past the 300ms transition */
    $preloader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
    setTimeout(() => {
      resolveFn(videos || []);
    }, 600);
  }

  /* Phase 1: smooth ramp 0→40 while waiting */
  const ramp = setInterval(() => {
    pct += Math.random() * 5 + 1;
    if (pct > 40) pct = 40;
    setPct(pct);
  }, 120);

  /* Phase 2: fonts ready → jump to 60 */
  fontsReady.then(() => {
    clearInterval(ramp);
    if (pct < 60) setPct(60);
  });

  /* Phase 3: data ready → smooth to 100 → reveal */
  dataReady.then((videos) => {
    clearInterval(ramp);
    const from = Math.max(pct, 60);
    const start = performance.now();
    const duration = 500;
    function animate(now) {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setPct(from + (100 - from) * ease);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        finish(videos);
      }
    }
    requestAnimationFrame(animate);
  }).catch(() => {
    finish([]);
  });

  /* Safety: 7s max */
  setTimeout(() => finish([]), 7000);

  return done;
}

/* ─── Parallax background ────────────────────────────────────────────── */

function initParallax() {
  if (!$pageBg || reducedMotion) return;
  let currentY = 0;
  let targetY = 0;
  let ticking = false;

  function update() {
    currentY += (targetY - currentY) * 0.1;
    if (Math.abs(targetY - currentY) < 0.05) currentY = targetY;
    $pageBg.style.transform = `translate3d(0, ${currentY}px, 0)`;
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    targetY = window.scrollY * 0.03;
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
}

/* ─── Bootstrap ──────────────────────────────────────────────────────── */

/* 1. Render hardcoded streams immediately */
renderStreams(STREAMS);

/* 2. Show skeletons for videos */
renderSkeletons($videoList, 6);

/* 3. Fetch RSS for Latest Videos */
const fontsReady = document.fonts?.ready || Promise.resolve();

const dataReady = fetchYouTubeVideos()
  .then((videos) => {
    console.log(`[EssKey] Loaded ${videos.length} videos. Latest: "${videos[0]?.title}" (${videos[0]?.id})`);
    latestVideos = videos;
    renderVideos(videos);
    return videos;
  })
  .catch((err) => {
    console.warn("[EssKey] All sources failed:", err.message);
    clearSkeletons($videoList);
    $videoList.innerHTML = '<p class="live-empty">Unable to load videos. Try refreshing.</p>';
    return [];
  });

/* 4. Preloader → reveal → init player */
runPreloader(fontsReady, dataReady).then((videos) => {
  initBgVideo();
  initParallax();

  if (!videos || !videos[0]) return;

  /*
   * Wait 2 paint frames after preloader is gone.
   * This guarantees the browser has actually rendered the page
   * so the YouTube iframe enters a truly visible context.
   * On mobile this is critical — otherwise autoplay gets blocked.
   */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bootPlayer(videos[0].id, videos[0].url);
    });
  });
});
