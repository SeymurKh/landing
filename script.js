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

const CONFIG = {
  CHANNEL_ID: "UCa9kWM8BbmFi5OpXbjyqk9w",
  RSS_URL: `https://www.youtube.com/feeds/videos.xml?channel_id=UCa9kWM8BbmFi5OpXbjyqk9w`,
  VISIBLE_VIDEO_COUNT: 6,        // How many videos to show initially (UI limit)
  MAX_VIDEOS: null,               // Max videos to fetch (null = no limit). YouTube RSS returns ~15 max.
  CACHE_TTL: 3 * 60 * 1000,       // 3 minutes
  PRELOADER_MAX_TIME: 8000,
  RSS_TIMEOUT: 12000,
  PARALLAX_FACTOR: 0.03,
  CACHE_KEY: "essk_v13",
};

const RSS_URL = CONFIG.RSS_URL;
const VISIBLE_VIDEO_COUNT = CONFIG.VISIBLE_VIDEO_COUNT;

/*
 * Two RSS proxy sources fetched in parallel.
 * First successful response wins. Each has a 12s timeout.
 * 
 * IMPORTANT: YouTube RSS feeds are limited to the last 15 videos by YouTube.
 * To get more videos, use YouTube Data API v3 instead of RSS.
 */
const DATA_SOURCES = [
  {
    name: "AllOrigins",
    url: `https://api.allorigins.win/get?url=${encodeURIComponent(RSS_URL)}`,
    async parse(json) {
      if (!json || typeof json !== "object") {
        throw new Error("Invalid response format");
      }
      if (json.status && json.status.http_code >= 400) {
        throw new Error(`Proxy error: ${json.status.http_code}`);
      }
      if (!json.contents) throw new Error("No contents in response");
      return parseYouTubeXml(json.contents);
    },
  },
  {
    name: "rss2json",
    url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`,
    parse(json) {
      if (!json || typeof json !== "object") {
        throw new Error("Invalid response format");
      }
      /* Check for API error response */
      if (json.status === "error") {
        throw new Error(json.message || "RSS2JSON API error");
      }
      if (!json.items?.length) throw new Error("No items in feed");
      /* rss2json returns ALL videos from the feed — no limit */
      return json.items.map((item) => {
        if (!item.link) return null;
        return {
          id:        extractVideoId(item.link),
          title:     item.title || "Untitled",
          url:       item.link,
          thumbnail: item.thumbnail || item.enclosure?.link || "",
          published: item.pubDate || "",
        };
      }).filter(Boolean);  /* Remove null entries */
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
  { id: "Y0BSnmYRh_8", title: "RADIO 24/7 | Organic House For Deep working, Art & Design Works", url: "https://www.youtube.com/live/Y0BSnmYRh_8", thumbnail: "https://i.ytimg.com/vi/Y0BSnmYRh_8/hqdefault.jpg" },
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

/** Validate email address with stricter regex */
function isValidEmail(email) {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email);
}

/** Build a YouTube thumbnail URL from a video ID */
function coverUrl(id) {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Validate that a string is a safe HTTP(S) URL to prevent XSS */
function isValidHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Extract 11-char YouTube video ID from various URL formats */
function extractVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/|\/videos\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : "";
}

/** Parse raw YouTube Atom XML into an array of video objects */
function parseYouTubeXml(xml) {
  if (!xml || typeof xml !== "string") {
    throw new Error("Invalid XML data");
  }
  
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  
  /* Check for parsing errors */
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("XML parsing failed - invalid feed format");
  }
  
  const entries = [...doc.querySelectorAll("entry")];
  if (!entries.length) throw new Error("No entries in XML feed");
  
  return entries.map((e) => {
    const id = e.querySelector("videoId")?.textContent || "";
    if (!id) {
      console.warn("[EssKey] Entry missing videoId, skipping");
      return null;
    }
    return {
      id,
      title:     e.querySelector("title")?.textContent || "Untitled",
      url:       `https://youtu.be/${id}`,
      thumbnail: coverUrl(id),
      published: e.querySelector("published")?.textContent || "",
    };
  }).filter(Boolean);  /* Remove null entries */
}


/* ─── 3b. Local Storage Cache ──────────────────────────────────────────── */

const CACHE_KEY = CONFIG.CACHE_KEY;
const CACHE_TTL = CONFIG.CACHE_TTL;

function cacheGet(key, ttl) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    
    const parsed = JSON.parse(item);
    if (!parsed || typeof parsed.ts !== "number" || !Array.isArray(parsed.data)) {
      /* Invalid cache structure - clear it */
      localStorage.removeItem(key);
      return null;
    }
    
    /* Check TTL */
    if (Date.now() - parsed.ts >= ttl) {
      localStorage.removeItem(key);
      return null;
    }
    
    return parsed.data;
  } catch (err) {
    console.warn("[EssKey] Cache read failed:", err.message);
    try {
      localStorage.removeItem(key);
    } catch (e) { /* Ignore cleanup errors */ }
    return null;
  }
}

function cacheSet(key, data) {
  try {
    if (!Array.isArray(data)) {
      console.warn("[EssKey] Cache write failed: data must be an array");
      return;
    }
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (err) {
    console.warn("[EssKey] Cache write failed:", err.message);
    /* QuotaExceededError - try to clear old cache */
    if (err.name === "QuotaExceededError") {
      try {
        localStorage.removeItem(key);
        console.log("[EssKey] Cleared old cache due to quota limit");
      } catch (e) { /* Ignore */ }
    }
  }
}


/* ─── 4. Data Fetching (RSS) ───────────────────────────────────────────── */

/**
 * Try a single RSS data source. Aborts after 12s.
 * Returns array of video objects on success, throws on failure with detailed error info.
 */
async function trySource(src) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CONFIG.RSS_TIMEOUT);
  try {
    const res = await fetch(src.url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const errType = res.status >= 500 ? 'server' : res.status === 404 ? 'notfound' : 'client';
      throw new Error(`HTTP ${res.status} (${errType})`);
    }
    const data = await res.json();
    const videos = await src.parse(data);
    if (!videos.length) throw new Error("Empty feed");
    return videos;
  } catch (err) {
    clearTimeout(timer);
    /* Enhance error message with context */
    if (err.name === 'AbortError') {
      throw new Error(`Timeout after ${CONFIG.RSS_TIMEOUT}ms`);
    }
    if (err.message.includes('Failed to fetch')) {
      throw new Error('Network error - check connection');
    }
    throw err;
  }
}

/**
 * Fetch latest videos. Strategy:
 *  1. Check localStorage cache (3 min TTL)
 *  2. Try AllOrigins + rss2json in parallel
 *  3. Filter out "RADIO 24/7" entries (those are streams)
 *  4. Cache the filtered result
 *  5. Fallback to stale cache if all sources fail
 * 
 * NOTE: YouTube RSS is limited to 15 most recent videos.
 * If you need more, implement YouTube Data API v3.
 */
async function fetchYouTubeVideos() {
  /* 1. Cache hit? */
  const cached = cacheGet(CACHE_KEY, CACHE_TTL);
  if (cached?.length) {
    console.log(`[EssKey] Using cached data (${cached.length} videos)`);
    return cached;
  }

  /* 2. Try both sources in parallel — use first successful result */
  const results = await Promise.all(
    DATA_SOURCES.map((s) => trySource(s).catch((err) => {
      console.warn(`[EssKey] ${s.name} failed:`, err.message);
      return null;
    }))
  );
  
  /* Pick first non-null result */
  for (const r of results) {
    if (!r || !r.length) continue;
    
    const totalFetched = r.length;
    /* 3. Filter streams (all start with "RADIO 24/7") */
    const filtered = r.filter((v) => !v.title.toUpperCase().startsWith("RADIO 24/7"));
    const streamsFiltered = totalFetched - filtered.length;
    
    /* Apply MAX_VIDEOS limit if configured */
    const limited = CONFIG.MAX_VIDEOS ? filtered.slice(0, CONFIG.MAX_VIDEOS) : filtered;
    
    console.log(`[EssKey] Fetched ${totalFetched} entries, filtered ${streamsFiltered} streams, ${limited.length} videos available`);
    
    if (limited.length) {
      /* 4. Cache before returning */
      cacheSet(CACHE_KEY, limited);
      return limited;
    }
  }
  
  /* All sources failed - try stale cache as last resort */
  try {
    const staleCache = localStorage.getItem(CACHE_KEY);
    if (staleCache) {
      const parsed = JSON.parse(staleCache);
      if (parsed?.data?.length) {
        console.warn("[EssKey] Using stale cache as fallback");
        return parsed.data;
      }
    }
  } catch (err) {
    console.warn("[EssKey] Could not read stale cache:", err.message);
  }
  
  /* Complete failure - throw detailed error */
  const failureReasons = results.filter(r => r === null).length;
  throw new Error(`All ${DATA_SOURCES.length} RSS sources failed (${failureReasons} errors). Check network connection.`);
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

/**
 * Render error state with retry button.
 * Shows user-friendly error message and allows manual retry.
 */
function renderErrorState(container, errorMsg) {
  container.innerHTML = "";
  
  const errorWrapper = document.createElement("div");
  errorWrapper.className = "error-state";
  errorWrapper.style.cssText = "padding:40px 20px;text-align:center;";
  
  const icon = document.createElement("p");
  icon.textContent = "⚠️";
  icon.style.cssText = "font-size:3rem;margin:0 0 16px;";
  
  const title = document.createElement("p");
  title.className = "live-empty";
  title.textContent = "Unable to load videos";
  title.style.cssText = "margin:0 0 8px;font-size:1.1rem;";
  
  const message = document.createElement("p");
  message.className = "live-empty";
  message.style.cssText = "font-size:0.85rem;margin:0 0 20px;opacity:0.7;";
  
  /* User-friendly error messages */
  if (errorMsg.includes("Timeout")) {
    message.textContent = "The request took too long. Please check your connection.";
  } else if (errorMsg.includes("Network error")) {
    message.textContent = "Unable to reach the server. Check your internet connection.";
  } else if (errorMsg.includes("All") && errorMsg.includes("sources failed")) {
    message.textContent = "All video sources are temporarily unavailable.";
  } else {
    message.textContent = "Something went wrong while loading videos.";
  }
  
  const retryBtn = document.createElement("button");
  retryBtn.className = "btn btn-line";
  retryBtn.textContent = "Try Again";
  retryBtn.style.cssText = "cursor:pointer;";
  retryBtn.addEventListener("click", () => {
    /* Clear cache and reload page */
    try {
      localStorage.removeItem(CONFIG.CACHE_KEY);
    } catch (e) {
      console.warn("[EssKey] Could not clear cache:", e);
    }
    window.location.reload();
  });
  
  errorWrapper.appendChild(icon);
  errorWrapper.appendChild(title);
  errorWrapper.appendChild(message);
  errorWrapper.appendChild(retryBtn);
  container.appendChild(errorWrapper);
}

/** Add a text link to a flyout dropdown */
function appendFlyoutLink(flyout, { title, url }) {
  /* Validate URL before adding */
  if (!isValidHttpUrl(url)) return;
  
  const a = document.createElement("a");
  a.className   = "flyout-link";
  a.href        = url;
  a.target      = "_blank";
  a.rel         = "noopener noreferrer";
  a.textContent = title || "Video";  /* Use textContent to prevent XSS */
  flyout.appendChild(a);
}

/** Create and append a media card to a grid container. Returns the card element. */
function appendMediaCard(container, video) {
  const { id, title, url, thumbnail } = video;
  
  /* Validate and sanitize URLs */
  const safeVideoUrl = isValidHttpUrl(url) ? url : id ? `https://youtu.be/${id}` : "";
  const bgUrl = isValidHttpUrl(thumbnail) ? thumbnail : coverUrl(id);

  const card = document.createElement("article");
  card.className = "media-card reveal";
  
  /* Escape CSS URL to prevent injection */
  const escapedBgUrl = bgUrl.replace(/[\\"']/g, (match) => {
    const escapes = { '"': '\\"', "'": "\\'", "\\": "\\\\" };
    return escapes[match] || match;
  });
  card.style.setProperty("--bg", `url('${escapedBgUrl}')`);
  
  /* Click handler only if URL is valid */
  if (safeVideoUrl) {
    card.addEventListener("click", () => window.open(safeVideoUrl, "_blank", "noopener"));
  }

  /* Build card body using safe DOM methods (no innerHTML) */
  const body = document.createElement("div");
  body.className = "media-card-body";

  const titleEl = document.createElement("h3");
  titleEl.className = "media-title";
  titleEl.textContent = title || "Untitled video";  /* Safe: textContent cannot execute JS */

  const link = document.createElement("a");
  link.className = "btn btn-line";
  link.textContent = "Watch";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (safeVideoUrl) link.href = safeVideoUrl;
  link.addEventListener("click", (event) => event.stopPropagation());

  body.appendChild(titleEl);
  body.appendChild(link);
  card.appendChild(body);

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
 * The <video> element in HTML has autoplay + muted + playsinline attributes.
 * This function runs after the preloader is gone and explicitly calls .play().
 * On iOS the HTML attributes usually suffice; on Android the JS .play() helps.
 * Touch/click listener is only the last resort if both fail.
 */
const $pageBg = document.querySelector(".page-bg");
const $bgVideo = document.querySelector(".page-bg-video");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initBgVideo() {
  if (!$bgVideo || reducedMotion) return;

  /* Already playing from HTML autoplay (e.g. iOS Safari) */
  if (!$bgVideo.paused) return;

  /* Explicitly call play — works on most Android browsers when video is visible */
  $bgVideo.play().then(() => {
    console.log("[EssKey] BG video playing");
  }).catch(() => {
    /* Browser blocked autoplay entirely — last resort: wait for any tap */
    console.log("[EssKey] BG video blocked, waiting for user interaction");
    const retry = () => {
      $bgVideo.play().catch(() => {});
    };
    document.addEventListener("touchstart", retry, { once: true, passive: true });
    document.addEventListener("click", retry, { once: true, passive: true });
  });
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
  
  /* Validate videoId — must be 11 alphanumeric chars */
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    console.error("[EssKey] Invalid video ID:", videoId);
    return;
  }
  
  /* Validate and set fallback link */
  if ($playerFallback && isValidHttpUrl(videoUrl)) {
    $playerFallback.href = videoUrl;
  }

  playerLoaded = true;

  /* Clear any existing content */
  $playerHost.innerHTML = "";

  /* Build the iframe — YouTube embed is safe by design */
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

/*
 * NOTE: This form uses mailto: approach.
 * Pros: No backend needed, works offline, user controls email sending
 * Cons: Requires email client, exposes email address, no server-side validation
 * 
 * For production with high volume, consider:
 * - Backend API (Node.js/PHP/Python) with email service
 * - Services: Formspree, EmailJS, SendGrid, etc.
 */

const $form   = document.getElementById("contactForm");
const $status = document.getElementById("formStatus");

if ($form && $status) {
  const $nameField = $form.querySelector("#name");
  const $emailField = $form.querySelector("#email");
  const $msgField = $form.querySelector("#message");
  
  let statusTimeout = null;

  /* Helper: show status message with auto-clear */
  function showStatus(message, type = "info", duration = 5000) {
    $status.textContent = message;
    $status.className = `form-status form-status--${type}`;
    $status.style.opacity = "1";
    
    if (statusTimeout) clearTimeout(statusTimeout);
    if (duration > 0) {
      statusTimeout = setTimeout(() => {
        $status.style.opacity = "0";
      }, duration);
    }
  }

  /* Real-time validation feedback on blur */
  if ($nameField) {
    $nameField.addEventListener("blur", () => {
      const val = $nameField.value.trim();
      if (val && val.length < 2) {
        showStatus("Name should be at least 2 characters.", "error", 3000);
      }
    });
  }

  if ($emailField) {
    $emailField.addEventListener("blur", () => {
      const val = $emailField.value.trim();
      if (val && !isValidEmail(val)) {
        showStatus("Please enter a valid email address.", "error", 3000);
      }
    });
  }

  /* Form submission */
  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const name  = $nameField.value.trim();
    const email = $emailField.value.trim();
    const msg   = $msgField.value.trim();

    /* Validation */
    if (name.length < 2) {
      showStatus("Please enter your name (at least 2 characters).", "error");
      $nameField.focus();
      return;
    }
    if (name.length > 60) {
      showStatus("Name is too long (max 60 characters).", "error");
      $nameField.focus();
      return;
    }
    if (!isValidEmail(email)) {
      showStatus("Please enter a valid email address.", "error");
      $emailField.focus();
      return;
    }
    if (email.length > 120) {
      showStatus("Email is too long (max 120 characters).", "error");
      $emailField.focus();
      return;
    }
    if (msg.length < 8) {
      showStatus("Please write a message (at least 8 characters).", "error");
      $msgField.focus();
      return;
    }
    if (msg.length > 1000) {
      showStatus("Message is too long (max 1000 characters).", "error");
      $msgField.focus();
      return;
    }

    /* Build mailto link */
    const subj = encodeURIComponent(`EssKey Music Contact Form — ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}`);
    const mailtoLink = `mailto:EssKey_YTB@protonmail.com?subject=${subj}&body=${body}`;
    
    /* Check if mailto is likely to work */
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const hasMailto = true; // Browsers support mailto, but client may not be configured
    
    try {
      window.location.href = mailtoLink;
      showStatus(
        isMobile 
          ? "Opening your email app... If nothing happens, please email us directly."
          : "Your email program should open now. If it doesn't, please copy the email address above.",
        "success",
        8000
      );
      
      /* Reset form after a short delay (user might need to see the data) */
      setTimeout(() => {
        $form.reset();
      }, 1000);
      
    } catch (err) {
      console.error("[EssKey] Mailto error:", err);
      showStatus(
        "Could not open email client. Please email us directly at EssKey_YTB@protonmail.com",
        "error",
        0  // Don't auto-hide
      );
    }
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

    /* Safety: reveal after max time regardless */
  setTimeout(reveal, CONFIG.PRELOADER_MAX_TIME);

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
    targetY = window.scrollY * CONFIG.PARALLAX_FACTOR; // parallax shift
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
    console.error("[EssKey] RSS fetch failed:", err.message);
    clearSkeletons($videoList);
    renderErrorState($videoList, err.message);
    return [];
  });

/* 4. Run preloader → reveal page → init player */
runPreloader(fontsReady, dataReady).then(() => {
  initBgVideo();
  initParallax();

  /*
   * Try to auto-boot the featured player.
   * Also hook into dataReady in case it resolves after the safety timeout.
   */
  tryAutoBoot();
  dataReady.then(tryAutoBoot); // Handles race condition: data arrives after preloader
});
