/* ─── Config ─────────────────────────────────────────────────────────── */

const CHANNEL_ID = "UCa9kWM8BbmFi5OpXbjyqk9w";

/* Multiple CORS proxies — tried in order until one succeeds */
const CORS_PROXIES = [
  { base: "https://api.allorigins.win/raw?url=", json: false },
  { base: "https://corsproxy.io/?url=",             json: false },
  { base: "https://api.allorigins.win/get?url=",     json: true  },
];

/* Fallback videos shown instantly while RSS loads */
const FALLBACK_VIDEOS = [
  { id: "Z8axMWvzUrE", title: "DEEP FOCUS PROTOCOL | Lo-fi Flow for Creations & Coding",           url: "https://youtu.be/Z8axMWvzUrE" },
  { id: "K5js77szFVM", title: "Deep Focus Frequency | Downtempo for Coding, Work & Inner Flow",     url: "https://youtu.be/K5js77szFVM" },
  { id: "SO1pmKFicTE", title: "Enter The Flow State | Ambient for Deep Work & Late-Night Thinking", url: "https://youtu.be/SO1pmKFicTE" },
];

/*
 * Live streams — UPDATE MANUALLY when you go live.
 * YouTube RSS does NOT include live streams, so this list
 * must be updated by hand after each new stream.
 */
const STREAMS = [
  { id: "xTyQE4I-7t8", title: "Deep Focus Frequency | Downtempo for Coding, Work & Inner Flow", url: "https://www.youtube.com/live/xTyQE4I-7t8" },
];

/* ─── DOM refs ───────────────────────────────────────────────────────── */

const $videoList      = document.getElementById("videoList");
const $videoFlyout    = document.getElementById("videoFlyout");
const $liveList       = document.getElementById("liveList");
const $liveFlyout     = document.getElementById("liveFlyout");
const $preloader      = document.getElementById("preloader");
const $preloaderBar   = document.getElementById("preloaderBar");
const $preloaderPct   = document.getElementById("preloaderPercent");

/* ─── Helpers ────────────────────────────────────────────────────────── */

const coverUrl = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

function cacheGet(key, ttl) {
  try {
    const { ts, data } = JSON.parse(localStorage.getItem(key) || "{}");
    return Date.now() - ts < ttl ? data : null;
  } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

/* Fetch a URL through CORS proxies with automatic fallback */
async function proxyFetch(url, timeout = 3500) {
  for (const proxy of CORS_PROXIES) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(proxy.base + encodeURIComponent(url), { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      if (proxy.json) {
        const { contents } = await res.json();
        return contents;
      }
      return await res.text();
    } catch { continue; }
  }
  throw new Error("All CORS proxies failed");
}

/* ─── Render helpers ─────────────────────────────────────────────────── */

function appendFlyoutLink(flyout, { title, url }) {
  const a = document.createElement("a");
  a.className  = "flyout-link";
  a.href       = url;
  a.target     = "_blank";
  a.rel        = "noopener noreferrer";
  a.textContent = title;
  flyout.appendChild(a);
}

function appendMediaCard(container, { id, title, url }) {
  const card = document.createElement("article");
  card.className = "media-card reveal";
  card.style.setProperty("--bg", `url('${coverUrl(id)}')`);
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

/* ─── Data fetching ──────────────────────────────────────────────────── */

/* Fetch latest videos from YouTube RSS feed (with CORS proxy fallback) */
async function loadLatestVideos() {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  const xml    = await proxyFetch(rssUrl);
  const doc    = new DOMParser().parseFromString(xml, "text/xml");

  /* YouTube RSS uses <entry> elements with <videoId> inside */
  const entries = [...doc.querySelectorAll("entry")].slice(0, 6);
  if (!entries.length) throw new Error("No entries in RSS feed");

  return entries.map((e) => {
    const id = e.querySelector("videoId")?.textContent || "";
    return {
      id,
      title: e.querySelector("title")?.textContent || "",
      url: `https://youtu.be/${id}`,
    };
  });
}

/* ─── Reveal animation (IntersectionObserver) ────────────────────────── */

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

const observeReveal = (el) => revealObs.observe(el);

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
let pendingVideoId  = null;   // video to load once player is ready

function updateFeatured(videoId, videoUrl) {
  if ($playerFallback) $playerFallback.href = videoUrl;
  if (ytPlayer?.loadVideoById) {
    ytPlayer.loadVideoById(videoId);
  } else {
    pendingVideoId = videoId;   // player not ready yet
  }
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

function bootYouTubePlayer(firstVideoId) {
  if (ytPlayerBooted || !window.YT?.Player) return;
  ytPlayerBooted = true;

  /* Prefer pendingVideoId (set by RSS) over firstVideoId */
  const videoId = pendingVideoId || firstVideoId || FALLBACK_VIDEOS[0].id;

  ytPlayer = new window.YT.Player("featuredPlayer", {
    videoId,
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

/* 1. Show cached or fallback videos immediately */
const cachedVideos  = cacheGet("essk_videos", 10 * 60 * 1000);
const initialVideos = cachedVideos || FALLBACK_VIDEOS;
renderVideos(initialVideos);
renderStreams(STREAMS);

/* 2. Fetch latest videos from RSS (with proxy fallback) */
const videosPromise = loadLatestVideos()
  .then((videos) => {
    renderVideos(videos);
    updateFeatured(videos[0].id, videos[0].url);
    cacheSet("essk_videos", videos);
    return videos;
  })
  .catch(() => {
    updateFeatured(initialVideos[0].id, initialVideos[0].url);
    return initialVideos;
  });

/* 3. Preloader — fast and smooth */
(function runPreloader(promise) {
  if (!$preloader || !$preloaderBar || !$preloaderPct) {
    document.body.classList.remove("is-loading");
    return;
  }

  let current = 0;
  let target  = 6;
  const start = performance.now();
  const minMs = 800;     // minimum visible duration
  const maxMs = 2000;    // hard stop

  const tick = () => {
    current += (target - current) * 0.12;
    if (target - current < 0.3) current = target;
    const pct = Math.round(Math.min(100, current));
    $preloaderBar.style.width = `${pct}%`;
    $preloaderPct.textContent = `${pct}%`;
    if (pct < 100) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  /* Advance to ~35% immediately */
  target = 35;

  /* Fonts ready → ~68% */
  const fontsReady = document.fonts?.ready?.then(() => {
    target = Math.max(target, 68);
  }) ?? Promise.resolve();

  /* Videos loaded → ~88% */
  const videosReady = promise.finally(() => {
    target = Math.max(target, 88);
  });

  /* All ready → 100% → hide preloader */
  const ready = Promise.allSettled([fontsReady, videosReady]).then(() => {
    const wait = Math.max(0, minMs - (performance.now() - start));
    return new Promise((r) => setTimeout(() => {
      target = 100;
      setTimeout(r, 200);
    }, wait));
  });

  /* Hard stop — never wait longer than maxMs */
  const hardStop = new Promise((r) => setTimeout(() => {
    target = 100;
    setTimeout(r, 200);
  }, maxMs));

  Promise.race([ready, hardStop]).then(() => {
    $preloader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
  });
})(videosPromise);

/* 4. Init heavy resources after preloader finishes */
videosPromise.then((videos) => {
  initBgVideo();
  initPlayerLazy(videos[0].id);
});
