/* ─── Config ─────────────────────────────────────────────────────────── */

const API_YOUTUBE = "/api/youtube";

/* Fallback — shown instantly while API loads */
const FALLBACK_VIDEOS = [
  { id: "Z8axMWvzUrE", title: "DEEP FOCUS PROTOCOL | Lo-fi Flow for Creations & Coding",           url: "https://youtu.be/Z8axMWvzUrE", thumbnail: "https://i.ytimg.com/vi/Z8axMWvzUrE/hqdefault.jpg" },
  { id: "K5js77szFVM", title: "Deep Focus Frequency | Downtempo for Coding, Work & Inner Flow",     url: "https://youtu.be/K5js77szFVM", thumbnail: "https://i.ytimg.com/vi/K5js77szFVM/hqdefault.jpg" },
  { id: "SO1pmKFicTE", title: "Enter The Flow State | Ambient for Deep Work & Late-Night Thinking", url: "https://youtu.be/SO1pmKFicTE", thumbnail: "https://i.ytimg.com/vi/SO1pmKFicTE/hqdefault.jpg" },
];

/*
 * Live streams — UPDATE MANUALLY after each new stream.
 * YouTube RSS does NOT include live streams.
 */
const STREAMS = [
  { id: "xTyQE4I-7t8", title: "Deep Focus Frequency | Downtempo for Coding, Work & Inner Flow", url: "https://www.youtube.com/live/xTyQE4I-7t8", thumbnail: "https://i.ytimg.com/vi/xTyQE4I-7t8/hqdefault.jpg" },
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

function coverUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

function cacheGet(key, ttl) {
  try {
    const { ts, data } = JSON.parse(localStorage.getItem(key) || "{}");
    return Date.now() - ts < ttl ? data : null;
  } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

/* Clear old cache from previous version */
try { localStorage.removeItem("essk_videos"); } catch {}

/* ─── API fetch (server-side, NO CORS) ───────────────────────────────── */

async function fetchYouTubeVideos() {
  const res = await fetch(API_YOUTUBE, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  if (!json.ok || !json.videos.length) throw new Error("No videos in API response");
  return json.videos;
}

/* ─── Render helpers ─────────────────────────────────────────────────── */

function appendFlyoutLink(flyout, { title, url }) {
  const a = document.createElement("a");
  a.className   = "flyout-link";
  a.href        = url;
  a.target      = "_blank";
  a.rel         = "noopener noreferrer";
  a.textContent = title;
  flyout.appendChild(a);
}

function appendMediaCard(container, { id, title, url, thumbnail }) {
  const bg = thumbnail || coverUrl(id);

  const card = document.createElement("article");
  card.className = "media-card reveal";
  card.style.setProperty("--bg", `url('${bg}')`);
  card.addEventListener("click", () => window.open(url, "_blank", "noopener"));
  card.insertAdjacentHTML("beforeend", `
    <div class="media-card-body">
      <h3 class="media-title">${title}</h3>
      <a class="btn btn-line" href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Watch</a>
    </div>
  `);
  container.appendChild(card);
  observeReveal(card);
}

function renderVideos(videos) {
  $videoList.innerHTML = "";
  if ($videoFlyout) $videoFlyout.innerHTML = "";
  for (const v of videos) {
    appendMediaCard($videoList, v);
    if ($videoFlyout) appendFlyoutLink($videoFlyout, v);
  }
}

function renderStreams(streams) {
  $liveList.innerHTML = "";
  if ($liveFlyout) $liveFlyout.innerHTML = "";
  for (const s of streams) {
    appendMediaCard($liveList, s);
    if ($liveFlyout) appendFlyoutLink($liveFlyout, s);
  }
}

/* ─── Reveal animation ──────────────────────────────────────────────── */

const revealObs = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("is-visible");
        revealObs.unobserve(e.target);
      }
    }
  },
  { threshold: 0.12 }
);

function observeReveal(el) { revealObs.observe(el); }

document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i * 60, 280)}ms`;
  revealObs.observe(el);
});

/* ─── Background video (lazy) ────────────────────────────────────────── */

const $bgVideo      = document.querySelector(".page-bg-video");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let bgVideoInit     = false;

function initBgVideo() {
  if (bgVideoInit || !$bgVideo || reducedMotion) return;
  bgVideoInit = true;

  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (conn?.saveData || /(?:^|slow-)2g/.test(conn?.effectiveType || "")) return;

  const src = $bgVideo.dataset.src;
  if (!src) return;

  const s = document.createElement("source");
  s.src  = src;
  s.type = "video/mp4";
  $bgVideo.appendChild(s);
  $bgVideo.load();
  $bgVideo.play().catch(() => {
    const retry = () => $bgVideo.play().catch(() => {});
    document.addEventListener("touchstart", retry, { once: true, passive: true });
    document.addEventListener("click",     retry, { once: true, passive: true });
  });
}

/* ─── Contact form ───────────────────────────────────────────────────── */

const $form   = document.getElementById("contactForm");
const $status = document.getElementById("formStatus");

if ($form && $status) {
  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name  = $form.querySelector("#name").value.trim();
    const email = $form.querySelector("#email").value.trim();
    const msg   = $form.querySelector("#message").value.trim();

    if (name.length < 2)                              { $status.textContent = "Please enter your name.";       return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))   { $status.textContent = "Please enter a valid email.";   return; }
    if (msg.length < 8)                               { $status.textContent = "Please add a short message.";   return; }

    const subj = encodeURIComponent(`EssKey Music Contact Form — ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}`);
    window.location.href = `mailto:EssKey_YTB@protonmail.com?subject=${subj}&body=${body}`;
    $status.textContent = "Your email app is opening with a pre-filled message.";
    $form.reset();
  });
}

/* ─── Featured YouTube player ────────────────────────────────────────── */

const $playerHost     = document.getElementById("featuredPlayer");
const $playerFallback = document.getElementById("playerFallback");
const $playerPlayBtn  = document.getElementById("playerPlayBtn");

let ytPlayer        = null;
let didStartPlay    = false;
let pendingVideoId  = null;

function updateFeatured(videoId, videoUrl) {
  if ($playerFallback) $playerFallback.href = videoUrl;
  if (ytPlayer?.loadVideoById) {
    ytPlayer.loadVideoById(videoId);
  } else {
    pendingVideoId = videoId;
  }
}

if ($playerHost) {
  $playerPlayBtn?.addEventListener("click", () => {
    if (!ytPlayer) { ensureYouTubeApi(pendingVideoId); return; }
    ytPlayer.mute();
    ytPlayer.playVideo();
  });
}

let ytApiRequested = false;
let ytPlayerBooted = false;

function bootYouTubePlayer(videoId) {
  if (ytPlayerBooted || !window.YT?.Player) return;
  ytPlayerBooted = true;

  /* Use the latest video ID from API, or pending, or fallback */
  const id = videoId || pendingVideoId || FALLBACK_VIDEOS[0].id;

  ytPlayer = new window.YT.Player("featuredPlayer", {
    videoId: id,
    playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1, modestbranding: 1 },
    events: {
      onReady(e) {
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
    },
  });

  setTimeout(() => {
    if (!didStartPlay) {
      $playerFallback?.classList.add("is-visible");
      $playerPlayBtn?.classList.add("is-visible");
    }
  }, 2500);
}

function ensureYouTubeApi(videoId) {
  if (ytApiRequested) return;
  ytApiRequested = true;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => bootYouTubePlayer(videoId);
}

function initPlayerLazy(videoId) {
  if (!$playerHost) return;
  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      (entries, o) => {
        if (entries.some((e) => e.isIntersecting)) {
          ensureYouTubeApi(videoId);
          o.disconnect();
        }
      },
      { rootMargin: "200px 0px" }
    );
    obs.observe($playerHost);
  } else {
    setTimeout(() => ensureYouTubeApi(videoId), 400);
  }
}

/* ─── Bootstrap ──────────────────────────────────────────────────────── */

/* 1. Show fallback videos immediately while API loads */
renderVideos(FALLBACK_VIDEOS);
renderStreams(STREAMS);

/* 2. Fetch latest videos from OUR serverless API (no CORS!) */
const CACHE_KEY = "essk_videos_v2";
const videosPromise = fetchYouTubeVideos()
  .then((videos) => {
    console.log(`[EssKey] Loaded ${videos.length} videos from API. Latest: "${videos[0].title}" (ID: ${videos[0].id})`);
    renderVideos(videos);
    cacheSet(CACHE_KEY, videos);

    /* Update featured player with the LATEST video */
    updateFeatured(videos[0].id, videos[0].url);
    return videos;
  })
  .catch((err) => {
    console.warn("[EssKey] API failed, using fallback:", err.message);

    /* Try loading from fresh cache */
    const cached = cacheGet(CACHE_KEY, 30 * 60 * 1000);
    if (cached && cached.length) {
      console.log(`[EssKey] Using cached ${cached.length} videos. Latest: "${cached[0].title}"`);
      renderVideos(cached);
      updateFeatured(cached[0].id, cached[0].url);
      return cached;
    }

    /* Last resort: fallback */
    console.log(`[EssKey] Using hardcoded fallback. Latest: "${FALLBACK_VIDEOS[0].title}"`);
    updateFeatured(FALLBACK_VIDEOS[0].id, FALLBACK_VIDEOS[0].url);
    return FALLBACK_VIDEOS;
  });

/* 3. Preloader */
(function runPreloader(promise) {
  if (!$preloader || !$preloaderBar || !$preloaderPct) {
    document.body.classList.remove("is-loading");
    return;
  }

  let current = 0;
  let target  = 6;
  const start = performance.now();
  const minMs = 700;
  const maxMs = 1800;

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

  const fontsReady = document.fonts?.ready?.then(() => {
    target = Math.max(target, 68);
  }) ?? Promise.resolve();

  const videosReady = promise.finally(() => {
    target = Math.max(target, 90);
  });

  const ready = Promise.allSettled([fontsReady, videosReady]).then(() => {
    const wait = Math.max(0, minMs - (performance.now() - start));
    return new Promise((r) => setTimeout(() => {
      target = 100;
      setTimeout(r, 180);
    }, wait));
  });

  const hardStop = new Promise((r) => setTimeout(() => {
    target = 100;
    setTimeout(r, 180);
  }, maxMs));

  Promise.race([ready, hardStop]).then(() => {
    $preloader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
  });
})(videosPromise);

/* 4. Init heavy resources AFTER preloader */
videosPromise.then((videos) => {
  initBgVideo();
  /* Pass the latest video ID to the player */
  initPlayerLazy(videos[0].id);
});
