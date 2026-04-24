// ─── Config ───────────────────────────────────────────────────────────────────

const CHANNEL_ID = "UCa9kWM8BbmFi5OpXbjyqk9w";
const PROXY = "https://api.allorigins.win/get?url=";

// Fallback videos shown instantly while RSS loads
const FALLBACK_VIDEOS = [
  { id: "Z8axMWvzUrE", title: "DEEP FOCUS PROTOCOL | Lo-fi Flow for Creations & Coding",           url: "https://youtu.be/Z8axMWvzUrE" },
  { id: "K5js77szFVM", title: "Deep Focus Frequency | Downtempo for Coding, Work & Inner Flow",     url: "https://youtu.be/K5js77szFVM" },
  { id: "SO1pmKFicTE", title: "Enter The Flow State | Ambient for Deep Work & Late-Night Thinking", url: "https://youtu.be/SO1pmKFicTE" }
];

// Hardcoded live streams (update manually when new streams are added)
const STREAMS = [
  { id: "xTyQE4I-7t8", title: "Deep Focus Frequency | Downtempo for Coding, Work & Inner Flow", url: "https://www.youtube.com/live/xTyQE4I-7t8" }
];

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const videoList  = document.getElementById("videoList");
const videoFlyout = document.getElementById("videoFlyout");
const liveList   = document.getElementById("liveList");
const liveFlyout = document.getElementById("liveFlyout");
const preloader = document.getElementById("preloader");
const preloaderBar = document.getElementById("preloaderBar");
const preloaderPercent = document.getElementById("preloaderPercent");

// ─── Helpers ──────────────────────────────────────────────────────────────────

// YouTube thumbnail URL
function coverUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

// Read from localStorage with a TTL (ms); returns null if missing/expired
function cacheGet(key, ttl) {
  try {
    const { ts, data } = JSON.parse(localStorage.getItem(key) || "{}");
    return Date.now() - ts < ttl ? data : null;
  } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// ─── Render helpers ───────────────────────────────────────────────────────────

// Build a flyout link
function appendFlyoutLink(flyout, { title, url }) {
  const a = document.createElement("a");
  a.className = "flyout-link";
  a.href = url;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.textContent = title;
  flyout.appendChild(a);
}

// Build a square media card and append it to a grid container
function appendMediaCard(container, { id, title, url }) {
  const card = document.createElement("article");
  card.className = "media-card reveal";
  card.style.setProperty("--bg", `url('${coverUrl(id)}')`);
  card.addEventListener("click", () => window.open(url, "_blank", "noreferrer"));
  card.insertAdjacentHTML("beforeend", `
    <div class="media-card-body">
      <h3 class="media-title">${title}</h3>
      <a class="btn btn-line" href="${url}" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">Watch</a>
    </div>
  `);
  container.appendChild(card);
  observeReveal(card);
}

// Render video cards + populate Videos flyout
function renderVideos(videos) {
  videoList.innerHTML = "";
  if (videoFlyout) videoFlyout.innerHTML = "";
  videos.forEach((v) => {
    appendMediaCard(videoList, v);
    if (videoFlyout) appendFlyoutLink(videoFlyout, v);
  });
}

// Render stream cards + populate Live flyout
function renderStreams(streams) {
  liveList.innerHTML = "";
  if (liveFlyout) liveFlyout.innerHTML = "";
  streams.forEach((s) => {
    appendMediaCard(liveList, s);
    if (liveFlyout) appendFlyoutLink(liveFlyout, s);
  });
}

// ─── Data fetching ────────────────────────────────────────────────────────────

// Fetch latest 3 videos from YouTube RSS feed
async function loadLatestVideos() {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3200);
  const res = await fetch(PROXY + encodeURIComponent(rssUrl), { signal: ctl.signal }).finally(() => clearTimeout(t));
  if (!res.ok) throw new Error("rss fetch failed");
  const { contents } = await res.json();
  const xml = new DOMParser().parseFromString(contents, "text/xml");
  const entries = [...xml.querySelectorAll("entry")].slice(0, 3);
  if (!entries.length) throw new Error("no entries");
  return entries.map((e) => ({
    id:    e.querySelector("videoId")?.textContent || "",
    title: e.querySelector("title")?.textContent   || "",
    url:   `https://youtu.be/${e.querySelector("videoId")?.textContent}`
  }));
}


// ─── Reveal animation ─────────────────────────────────────────────────────────

const revealObserver = new IntersectionObserver(
  (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("is-visible"); }),
  { threshold: 0.15 }
);

function observeReveal(el) { revealObserver.observe(el); }

document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i * 70, 320)}ms`;
  revealObserver.observe(el);
});

// ─── Background video parallax ────────────────────────────────────────────────

const pageBgVideo = document.querySelector(".page-bg-video");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let backgroundVideoInitialized = false;

function initBackgroundVideo() {
  if (backgroundVideoInitialized || !pageBgVideo || prefersReducedMotion) return;
  backgroundVideoInitialized = true;

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const isSlowNetwork = Boolean(connection?.saveData) || /(?:^|slow-)2g/.test(connection?.effectiveType || "");
  const videoSrc = pageBgVideo.dataset.src;
  if (!videoSrc || isSlowNetwork) return;

  const source = document.createElement("source");
  source.src = videoSrc;
  source.type = "video/mp4";
  pageBgVideo.appendChild(source);
  pageBgVideo.load();
  pageBgVideo.play().catch(() => {
    const retry = () => pageBgVideo.play().catch(() => {});
    document.addEventListener("touchstart", retry, { once: true, passive: true });
    document.addEventListener("click", retry, { once: true, passive: true });
  });
}

// ─── Contact form ─────────────────────────────────────────────────────────────

const contactForm = document.getElementById("contactForm");
const formStatus  = document.getElementById("formStatus");

if (contactForm && formStatus) {
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name    = contactForm.querySelector("#name").value.trim();
    const email   = contactForm.querySelector("#email").value.trim();
    const message = contactForm.querySelector("#message").value.trim();

    if (name.length < 2)                            { formStatus.textContent = "Please enter your name.";          return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { formStatus.textContent = "Please enter a valid email.";      return; }
    if (message.length < 8)                         { formStatus.textContent = "Please add a short message.";      return; }

    const subject = encodeURIComponent(`EssKey Music Contact Form - ${name}`);
    const body    = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`);
    window.location.href = `mailto:EssKey_YTB@protonmail.com?subject=${subject}&body=${body}`;
    formStatus.textContent = "Your email app is opening with a pre-filled message.";
    contactForm.reset();
  });
}

// ─── Featured YouTube player ──────────────────────────────────────────────────

const featuredPlayerHost = document.getElementById("featuredPlayer");
const playerFallback     = document.getElementById("playerFallback");
const playerPlayBtn      = document.getElementById("playerPlayBtn");

let ytPlayer       = null;
let didStartPlay   = false;
let pendingVideoId = null; // video to load once the player is ready

function updateFeaturedPlayer(videoId, videoUrl) {
  if (playerFallback) playerFallback.href = videoUrl;
  if (ytPlayer?.loadVideoById) {
    ytPlayer.loadVideoById(videoId);
  } else {
    pendingVideoId = videoId; // player not ready yet; apply in onReady
  }
}

if (featuredPlayerHost) {
  playerPlayBtn?.addEventListener("click", () => {
    if (!ytPlayer) {
      ensureYouTubeApi();
      return;
    }
    ytPlayer.mute();
    ytPlayer.playVideo();
  });
}

let ytApiRequested = false;
let ytPlayerBooted = false;

function bootYouTubePlayer() {
  if (ytPlayerBooted || !window.YT?.Player) return;
  ytPlayerBooted = true;
  ytPlayer = new window.YT.Player("featuredPlayer", {
    videoId: FALLBACK_VIDEOS[0].id,
    playerVars: { autoplay: 1, controls: 1, rel: 0, playsinline: 1, modestbranding: 1 },
    events: {
      onReady(e) {
        e.target.mute();
        if (pendingVideoId && pendingVideoId !== FALLBACK_VIDEOS[0].id) {
          e.target.loadVideoById(pendingVideoId);
        }
        e.target.playVideo();
      },
      onStateChange(e) {
        const S = window.YT.PlayerState;
        if (e.data === S.PLAYING) {
          didStartPlay = true;
          playerFallback?.classList.remove("is-visible");
          playerPlayBtn?.classList.remove("is-visible");
        } else if (e.data === S.PAUSED || e.data === S.UNSTARTED) {
          playerPlayBtn?.classList.add("is-visible");
        }
      }
    }
  });

  setTimeout(() => {
    if (!didStartPlay) {
      playerFallback?.classList.add("is-visible");
      playerPlayBtn?.classList.add("is-visible");
    }
  }, 2500);
}

function ensureYouTubeApi() {
  if (ytApiRequested) return;
  ytApiRequested = true;
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => bootYouTubePlayer();
}

function initFeaturedPlayerLazy() {
  if (!featuredPlayerHost) return;
  if ("IntersectionObserver" in window) {
    const ytObserver = new IntersectionObserver(
      (entries, obs) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          ensureYouTubeApi();
          obs.disconnect();
        }
      },
      { rootMargin: "220px 0px" }
    );
    ytObserver.observe(featuredPlayerHost);
  } else {
    setTimeout(() => ensureYouTubeApi(), 600);
  }
}

// ─── Bootstrap data ───────────────────────────────────────────────────────────

// Videos: show cache or fallback instantly, then refresh from RSS
const cachedVideos = cacheGet("essk_videos", 30 * 60 * 1000);
renderVideos(cachedVideos || FALLBACK_VIDEOS);
updateFeaturedPlayer(
  (cachedVideos || FALLBACK_VIDEOS)[0].id,
  (cachedVideos || FALLBACK_VIDEOS)[0].url
);

const latestVideosPromise = loadLatestVideos()
  .then((videos) => {
    renderVideos(videos);
    updateFeaturedPlayer(videos[0].id, videos[0].url);
    cacheSet("essk_videos", videos);
    return videos;
  })
  .catch(() => null);

// Streams: rendered immediately from hardcoded list
renderStreams(STREAMS);

function runPreloader(videosPromise) {
  if (!preloader || !preloaderBar || !preloaderPercent) {
    document.body.classList.remove("is-loading");
    return Promise.resolve();
  }

  let current = 0;
  let target = 6;
  const start = performance.now();
  const minDuration = 1100;
  const maxDuration = 2600;
  let fontsReady = false;
  let videosReady = false;

  const raf = () => {
    current += (target - current) * 0.09;
    if (target - current < 0.15) current = target;
    const rounded = Math.round(Math.min(100, current));
    preloaderBar.style.width = `${rounded}%`;
    preloaderPercent.textContent = `${rounded}%`;
    if (rounded < 100) requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);

  target = 24;
  requestAnimationFrame(() => { target = Math.max(target, 38); });

  const fontsPromise = document.fonts?.ready
    ? document.fonts.ready.then(() => { fontsReady = true; target = Math.max(target, 62); })
    : Promise.resolve().then(() => { fontsReady = true; target = Math.max(target, 62); });

  const vidsPromise = Promise.resolve(videosPromise)
    .finally(() => {
      videosReady = true;
      target = Math.max(target, 82);
    });

  const readiness = Promise.allSettled([fontsPromise, vidsPromise]).then(() => {
    const waitLeft = Math.max(0, minDuration - (performance.now() - start));
    return new Promise((resolve) => {
      setTimeout(() => {
        target = 100;
        setTimeout(resolve, 220);
      }, waitLeft);
    });
  });

  const hardStop = new Promise((resolve) => {
    setTimeout(() => {
      target = 100;
      setTimeout(resolve, 220);
    }, maxDuration);
  });

  return Promise.race([readiness, hardStop]).then(() => {
    preloader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
  });
}

runPreloader(latestVideosPromise).then(() => {
  initBackgroundVideo();
  initFeaturedPlayerLazy();
});
