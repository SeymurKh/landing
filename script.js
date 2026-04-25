/* ═══════════════════════════════════════════════════════════════════════════
   EssKeyMusic — Landing Page Script
   ═══════════════════════════════════════════════════════════════════════════

   Structure:
     1. Config & Data Sources
     2. DOM References
     3. Utility Functions
     4. Data Fetching (RSS → Latest Videos)
     5. Rendering (cards, skeletons, show-more)
     6. Scroll Reveal Animation
     7. Background Video Fallback
     8. Featured YouTube Player
     9. Contact Form
    10. Preloader
    11. Parallax
    12. Bootstrap (entry point)
   ═══════════════════════════════════════════════════════════════════════════ */


/* ─── 1. Config & Data Sources ─────────────────────────────────────────── */

const CHANNEL_ID = "UCa9kWM8BbmFi5OpXbjyqk9w";
const RSS_URL    = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

/* How many video cards are visible before "Show all" */
const VISIBLE_VIDEO_COUNT = 6;

/*
 * Two RSS proxy sources fetched in parallel via Promise.any.
 * First successful response wins. Each has a 12s timeout.
 */
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
      /* rss2json returns ALL videos from the feed — no limit */
      return json.items.map((item) => ({
        id:        extractVideoId(item.link),
        title:     item.title,
        url:       item.link,
        thumbnail: item.thumbnail || item.enclosure?.link || "",
        published: item.pubDate,
      }));
    },
  },
];

/*
 * Streams — HARDCODED.
 * YouTube RSS cannot distinguish live streams from regular uploads.
 * Update this array manually when a new stream goes live.
 */
const STREAMS = [
  { id: "RJtt_Jd9Uns", title: "RADIO 24/7 | Downtempo for Coding, Work & Inner Flow",           url: "https://www.youtube.com/live/RJtt_Jd9Uns", thumbnail: "https://i.ytimg.com/vi/RJtt_Jd9Uns/hqdefault.jpg" },
  { id: "Y0BSnmYRh_8", title: "RADIO 24/7! Organic House For Deep working, Art & Design Works", url: "https://www.youtube.com/live/Y0BSnmYRh_8", thumbnail: "https://i.ytimg.com/vi/Y0BSnmYRh_8/hqdefault.jpg" },
];


/* ─── 2. DOM References ────────────────────────────────────────────────── */

const $videoList    = document.getElementById("videoList");
const $videoFlyout  = document.getElementById("videoFlyout");
const $liveList     = document.getElementById("liveList");
const $liveFlyout   = document.getElementById("liveFlyout");
const $preloader    = document.getElementById("preloader");
const $preloaderBar = document.getElementById("preloaderBar");
const $preloaderPct = document.getElementById("preloaderPercent");


/* ─── 3. Utility Functions ─────────────────────────────────────────────── */

/** Build a YouTube thumbnail URL from a video ID */
function coverUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Extract 11-char YouTube video ID from various URL formats */
function extractVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/|\/videos\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : "";
}

/** Parse raw YouTube Atom XML into an array of video objects */
function parseYouTubeXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const entries = [...doc.querySelectorAll("entry")];
  if (!entries.length) throw new Error("No entries in XML");
  return entries.map((e) => {
    const id = e.querySelector("videoId")?.textContent || "";
    return {
      id,
      title:     e.querySelector("title")?.textContent || "",
      url:       `https://youtu.be/${id}`,
      thumbnail: coverUrl(id),
      published: e.querySelector("published")?.textContent || "",
    };
  });
}


/* ─── 3b. Local Storage Cache ──────────────────────────────────────────── */

const CACHE_KEY = "essk_v13";
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

function cacheGet(key, ttl) {
  try {
    const { ts, data } = JSON.parse(localStorage.getItem(key) || "{}");
    return Date.now() - ts < ttl ? data : null;
  } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}


/* ─── 4. Data Fetching (RSS) ───────────────────────────────────────────── */

/**
 * Try a single RSS data source. Aborts after 12s.
 * Returns array of video objects on success, throws on failure.
 */
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
    return videos;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Fetch latest videos. Strategy:
 *  1. Check localStorage cache (3 min TTL)
 *  2. Try AllOrigins + rss2json in parallel (Promise.any)
 *  3. Filter out "RADIO 24/7" entries (those are streams)
 *  4. Cache the filtered result
 */
async function fetchYouTubeVideos() {
  /* 1. Cache hit? */
  const cached = cacheGet(CACHE_KEY, CACHE_TTL);
  if (cached?.length) return cached;

  /* 2. Try both sources in parallel — first success wins */
  const results = await Promise.all(
    DATA_SOURCES.map((s) => trySource(s).catch((err) => {
      console.warn(`[EssKey] ${s.name} failed:`, err.message);
      return null;
    }))
  );
  for (const r of results) {
    if (!r) continue;
    /* 3. Filter streams (all start with "RADIO 24/7") */
    const filtered = r.filter((v) => !v.title.toUpperCase().startsWith("RADIO 24/7"));
    if (filtered.length) {
      /* 4. Cache before returning */
      cacheSet(CACHE_KEY, filtered);
      return filtered;
    }
  }
  throw new Error("All RSS sources failed");
}


/* ─── 5. Rendering ─────────────────────────────────────────────────────── */

/** Show placeholder shimmer cards while data loads */
function renderSkeletons(container, count) {
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "skeleton-card";
    container.appendChild(el);
  }
}

/** Remove all skeleton cards from a container */
function clearSkeletons(container) {
  container.querySelectorAll(".skeleton-card").forEach((s) => s.remove());
}

/** Add a text link to a flyout dropdown */
function appendFlyoutLink(flyout, { title, url }) {
  const a = document.createElement("a");
  a.className   = "flyout-link";
  a.href        = url;
  a.target      = "_blank";
  a.rel         = "noopener noreferrer";
  a.textContent = title;
  flyout.appendChild(a);
}

/** Create and append a media card to a grid container. Returns the card element. */
function appendMediaCard(container, video) {
  const { id, title, url, thumbnail } = video;
  const bg = thumbnail || coverUrl(id);

  const card = document.createElement("article");
  card.className = "media-card reveal";
  card.style.setProperty("--bg", `url('${bg}')`);
  card.addEventListener("click", () => window.open(url, "_blank", "noopener"));
  card.insertAdjacentHTML(
    "beforeend",
    `<div class="media-card-body">
      <h3 class="media-title">${title}</h3>
      <a class="btn btn-line" href="${url}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">Watch</a>
    </div>`
  );
  container.appendChild(card);
  observeReveal(card);
  return card;
}

/**
 * Render the Latest Videos grid.
 * Shows first VISIBLE_VIDEO_COUNT cards, hides the rest.
 * Adds a "Show all N videos" / "Show less" toggle button.
 */
function renderVideos(videos) {
  clearSkeletons($videoList);
  $videoList.innerHTML = "";
  if ($videoFlyout) $videoFlyout.innerHTML = "";

  /* Create all cards */
  const cards = videos.map((v) => appendMediaCard($videoList, v));

  /* Flyout links (top nav dropdown) — always show all */
  if ($videoFlyout) {
    for (const v of videos) appendFlyoutLink($videoFlyout, v);
  }

  /* If more than VISIBLE_VIDEO_COUNT, hide extras + add toggle button */
  if (cards.length <= VISIBLE_VIDEO_COUNT) return;

  /* Hide cards beyond the visible limit */
  cards.forEach((card, i) => {
    if (i >= VISIBLE_VIDEO_COUNT) card.classList.add("is-hidden-card");
  });

  /* Remove old toggle button if re-rendering */
  document.getElementById("showMoreBtn")?.remove();

  /* Create toggle button */
  const btn = document.createElement("button");
  btn.id = "showMoreBtn";
  btn.className = "btn btn-ghost show-more-btn";
  btn.textContent = `Show all ${videos.length} videos`;
  let expanded = false;

  btn.addEventListener("click", () => {
    expanded = !expanded;
    cards.forEach((card, i) => {
      if (i >= VISIBLE_VIDEO_COUNT) {
        card.classList.toggle("is-hidden-card", !expanded);
      }
    });
    btn.textContent = expanded ? "Show less" : `Show all ${videos.length} videos`;
  });

  /* Insert button right after the grid */
  $videoList.parentNode.insertBefore(btn, $videoList.nextSibling);
}

/** Render the hardcoded Streams grid */
function renderStreams(streams) {
  $liveList.innerHTML = "";
  if ($liveFlyout) $liveFlyout.innerHTML = "";
  for (const s of streams) {
    appendMediaCard($liveList, s);
    if ($liveFlyout) appendFlyoutLink($liveFlyout, s);
  }
}


/* ─── 6. Scroll Reveal Animation ───────────────────────────────────────── */

/**
 * Elements with class "reveal" fade in + slide up when they enter the viewport.
 * Uses IntersectionObserver for performance (no scroll event listener).
 */
const revealObs = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObs.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.1 }
);

function observeReveal(el) {
  revealObs.observe(el);
}

/* Observe all .reveal elements already in the HTML (hero content, section heads, etc.) */
document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i * 50, 200)}ms`;
  revealObs.observe(el);
});


/* ─── 7. Background Video Fallback ─────────────────────────────────────── */

/**
 * The <video> element in HTML already has autoplay + muted + playsinline
 * for maximum browser compatibility. This function adds a JS fallback:
 * if autoplay was blocked by the browser, retry on first user interaction.
 */
const $pageBg = document.querySelector(".page-bg");
const $bgVideo = document.querySelector(".page-bg-video");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initBgVideoFallback() {
  if (!$bgVideo || reducedMotion) return;

  /* If video is already playing, nothing to do */
  if (!$bgVideo.paused) return;

  /* Autoplay was blocked — retry on first user gesture */
  const retry = () => {
    $bgVideo.play().catch(() => {});
    /* Clean up listeners after first attempt */
    document.removeEventListener("touchstart", retry);
    document.removeEventListener("click", retry);
  };
  document.addEventListener("touchstart", retry, { once: true, passive: true });
  document.addEventListener("click", retry, { once: true, passive: true });
}


/* ─── 8. Featured YouTube Player ───────────────────────────────────────── */

/*
 * Strategy: simple iframe with autoplay=1&mute=1.
 * No fragile YT IFrame API — just a standard embed iframe.
 * The iframe is created AFTER the preloader is gone (visible context).
 *
 * If autoplay is blocked by the browser:
 *   — YouTube shows its own "Tap to play" inside the iframe.
 *   — Our pulsing Play button also works as a fallback.
 *     Each click recreates the iframe (fresh autoplay attempt).
 */

const $playerHost    = document.getElementById("featuredPlayer");
const $playerFallback = document.getElementById("playerFallback");
const $playerPlayBtn  = document.getElementById("playerPlayBtn");

let playerLoaded  = false;  // Whether an iframe has been created
let latestVideos   = [];     // Populated after RSS fetch

/* Show the Play button immediately — serves as visual fallback */
if ($playerPlayBtn) $playerPlayBtn.classList.add("is-visible");

/**
 * Create (or recreate) the YouTube embed iframe.
 * Safe to call multiple times — each call gives a fresh autoplay attempt.
 */
function bootPlayer(videoId, videoUrl) {
  if (!$playerHost) return;
  playerLoaded = true;
  if ($playerFallback) $playerFallback.href = videoUrl;

  /* Clear any existing content */
  $playerHost.innerHTML = "";

  /* Build the iframe */
  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1&modestbranding=1`;
  iframe.allow = "autoplay; encrypted-media";
  iframe.allowFullscreen = true;
  iframe.style.cssText = "width:100%;height:100%;border:0;position:absolute;inset:0";
  $playerHost.appendChild(iframe);
}

/** Try to auto-boot the player (called after preloader is gone) */
function tryAutoBoot() {
  if (latestVideos.length && !playerLoaded) {
    /* 2 paint frames delay — ensures browser has rendered the page */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bootPlayer(latestVideos[0].id, latestVideos[0].url);
        /* Optimistically hide play button */
        if ($playerPlayBtn) $playerPlayBtn.classList.remove("is-visible");
        if ($playerFallback) $playerFallback.classList.add("is-visible");
      });
    });
  }
}

/* Play button click — user gesture = guaranteed autoplay */
if ($playerPlayBtn) {
  $playerPlayBtn.addEventListener("click", () => {
    if (!latestVideos.length) return;
    const v = latestVideos[0];
    /* Recreate iframe (fresh autoplay within user gesture context) */
    bootPlayer(v.id, v.url);
    $playerPlayBtn.classList.remove("is-visible");
    if ($playerFallback) $playerFallback.classList.add("is-visible");
  });
}


/* ─── 9. Contact Form ──────────────────────────────────────────────────── */

const $form   = document.getElementById("contactForm");
const $status = document.getElementById("formStatus");

if ($form && $status) {
  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name  = $form.querySelector("#name").value.trim();
    const email = $form.querySelector("#email").value.trim();
    const msg   = $form.querySelector("#message").value.trim();

    if (name.length < 2) { $status.textContent = "Please enter your name."; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $status.textContent = "Please enter a valid email."; return; }
    if (msg.length < 8)  { $status.textContent = "Please add a short message."; return; }

    const subj = encodeURIComponent(`EssKey Music Contact Form — ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}`);
    window.location.href = `mailto:EssKey_YTB@protonmail.com?subject=${subj}&body=${body}`;
    $status.textContent = "Your email app is opening with a pre-filled message.";
    $form.reset();
  });
}


/* ─── 10. Preloader ────────────────────────────────────────────────────── */

/**
 * Smooth milestone-based preloader.
 * Phases: 0→40% (random ramp) → 60% (fonts ready) → 100% (data ready).
 * Returns a Promise that resolves AFTER the preloader is fully hidden.
 *
 * Safety timeout: 8s max — reveals the page even if data never arrives.
 */
function runPreloader(fontsReady, dataReady) {
  if (!$preloader || !$preloaderBar || !$preloaderPct) {
    document.body.classList.remove("is-loading");
    return Promise.resolve();
  }

  let pct      = 0;
  let finished = false;
  let resolveFn;
  const done = new Promise((r) => { resolveFn = r; });

  function setPct(v) {
    pct = Math.min(Math.round(v), 100);
    $preloaderBar.style.width = pct + "%";
    $preloaderPct.textContent = pct + "%";
  }

  /** Reveal the page — can only run once */
  function reveal() {
    if (finished) return;
    finished = true;
    setPct(100);
    $preloader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
    /* Wait for CSS fade-out transition (300ms) + extra buffer */
    setTimeout(resolveFn, 600);
  }

  /* Phase 1: Random ramp 0 → 40% while waiting */
  const ramp = setInterval(() => {
    pct += Math.random() * 5 + 1;
    if (pct > 40) pct = 40;
    setPct(pct);
  }, 120);

  /* Phase 2: Fonts loaded → jump to 60% */
  fontsReady.then(() => {
    clearInterval(ramp);
    if (pct < 60) setPct(60);
  });

  /* Phase 3: Data loaded → smooth easeOutCubic to 100% → reveal */
  dataReady.then(() => {
    clearInterval(ramp);
    const from    = Math.max(pct, 60);
    const start   = performance.now();
    const duration = 500;
    function animate(now) {
      const t    = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setPct(from + (100 - from) * ease);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        reveal();
      }
    }
    requestAnimationFrame(animate);
  }).catch(() => {
    reveal(); // Even if data fails, reveal the page
  });

  /* Safety: reveal after 8s regardless */
  setTimeout(reveal, 8000);

  return done;
}


/* ─── 11. Parallax Background ──────────────────────────────────────────── */

/**
 * Shifts the background video vertically by 3% of scroll position.
 * Uses lerp (linear interpolation) for smooth, lag-free movement.
 * Disabled if user prefers reduced motion.
 */
function initParallax() {
  if (!$pageBg || reducedMotion) return;

  let currentY = 0;
  let targetY  = 0;
  let ticking  = false;

  function update() {
    currentY += (targetY - currentY) * 0.1; // lerp factor
    if (Math.abs(targetY - currentY) < 0.05) currentY = targetY;
    $pageBg.style.transform = `translate3d(0, ${currentY}px, 0)`;
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    targetY = window.scrollY * 0.03; // 3% shift
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
}


/* ─── 12. Bootstrap (Entry Point) ──────────────────────────────────────── */

/* 1. Render hardcoded streams immediately (no network needed) */
renderStreams(STREAMS);

/* 2. Show skeleton placeholders while RSS loads */
renderSkeletons($videoList, VISIBLE_VIDEO_COUNT);

/* 3. Start fetching RSS data */
const fontsReady = document.fonts?.ready || Promise.resolve();

const dataReady = fetchYouTubeVideos()
  .then((videos) => {
    console.log(`[EssKey] Loaded ${videos.length} videos. Latest: "${videos[0]?.title}"`);
    latestVideos = videos;
    renderVideos(videos);
    return videos;
  })
  .catch((err) => {
    console.warn("[EssKey] RSS fetch failed:", err.message);
    clearSkeletons($videoList);
    $videoList.innerHTML = '<p class="live-empty">Unable to load videos. Try refreshing.</p>';
    return [];
  });

/* 4. Run preloader → reveal page → init player */
runPreloader(fontsReady, dataReady).then(() => {
  initBgVideoFallback();
  initParallax();

  /*
   * Try to auto-boot the featured player.
   * Also hook into dataReady in case it resolves after the safety timeout.
   */
  tryAutoBoot();
  dataReady.then(tryAutoBoot); // Handles race condition: data arrives after preloader
});
