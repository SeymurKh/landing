/* ═══════════════════════════════════════════════════════════════════════════
   EssKeyMusic — Landing Page Script
   ═══════════════════════════════════════════════════════════════════════════

   Structure:
     1. Config & Data Sources
     2. DOM References
     3. Utility Functions
     4. Data Fetching (YouTube API v3 + RSS Fallback)
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
  
  // YouTube Data API v3 Key
  // ⚠️ SECURITY: Restrict this key in Google Cloud Console:
  //    - Go to: https://console.cloud.google.com/apis/credentials
  //    - Edit this key → Application restrictions: HTTP referrers
  //    - Add: https://esskeymusic.com/* and https://*.github.io/*
  YOUTUBE_API_KEY: "AIzaSyBF1CMRH89borC-ibFL3LXX_7XofUJLEuY",
  
  RSS_URL: `https://www.youtube.com/feeds/videos.xml?channel_id=UCa9kWM8BbmFi5OpXbjyqk9w`,
  VISIBLE_VIDEO_COUNT: 6,        // How many videos to show initially (UI limit)
  MAX_VIDEOS: 50,                // Max videos to fetch via YouTube API (up to 50)
  CACHE_TTL: 5 * 60 * 1000,      // 5 minutes (increased for API quota)
  PRELOADER_MAX_TIME: 8000,
  API_TIMEOUT: 10000,            // YouTube API timeout
  RSS_TIMEOUT: 12000,
  PARALLAX_FACTOR: 0.03,
  CACHE_KEY: "essk_v14",         // Updated cache key for new format
};

const RSS_URL = CONFIG.RSS_URL;
const VISIBLE_VIDEO_COUNT = CONFIG.VISIBLE_VIDEO_COUNT;


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
  }).filter(Boolean);
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
      localStorage.removeItem(key);
      return null;
    }
    
    if (Date.now() - parsed.ts >= ttl) {
      localStorage.removeItem(key);
      return null;
    }
    
    return parsed.data;
  } catch (err) {
    console.warn("[EssKey] Cache read failed:", err.message);
    try {
      localStorage.removeItem(key);
    } catch (e) {}
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
    if (err.name === "QuotaExceededError") {
      try {
        localStorage.removeItem(key);
        console.log("[EssKey] Cleared old cache due to quota limit");
      } catch (e) {}
    }
  }
}


/* ─── 4. Data Fetching (YouTube API v3 + RSS Fallback) ────────────────── */

/**
 * Fetch videos using YouTube Data API v3.
 * This is the PRIMARY method - more reliable and gets up to 50 videos.
 * 
 * API endpoint: playlistItems.list
 * - Uses the channel's "uploads" playlist to get all videos
 * - More efficient than search.list (lower quota cost)
 */
async function fetchViaYouTubeAPI() {
  const uploadsPlaylistId = CONFIG.CHANNEL_ID.replace("UC", "UU");
  
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet,contentDetails");
  url.searchParams.set("playlistId", uploadsPlaylistId);
  url.searchParams.set("maxResults", String(CONFIG.MAX_VIDEOS));
  url.searchParams.set("key", CONFIG.YOUTUBE_API_KEY);
  
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CONFIG.API_TIMEOUT);
  
  try {
    const res = await fetch(url.toString(), { signal: ctl.signal });
    clearTimeout(timer);
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${res.status}`;
      
      // Check for quota exceeded
      if (res.status === 403 && errorMsg.includes("quota")) {
        throw new Error("YouTube API quota exceeded");
      }
      
      throw new Error(`YouTube API error: ${errorMsg}`);
    }
    
    const data = await res.json();
    
    if (!data.items || !data.items.length) {
      throw new Error("No videos found in API response");
    }
    
    // Parse API response into our video format
    const videos = data.items
      .filter(item => item.snippet?.resourceId?.videoId)
      .map(item => {
        const videoId = item.snippet.resourceId.videoId;
        const title = item.snippet.title || "Untitled";
        
        // Skip private/deleted videos
        if (title === "Private video" || title === "Deleted video") {
          return null;
        }
        
        return {
          id: videoId,
          title: title,
          url: `https://youtu.be/${videoId}`,
          thumbnail: item.snippet.thumbnails?.high?.url || 
                     item.snippet.thumbnails?.medium?.url || 
                     coverUrl(videoId),
          published: item.contentDetails?.videoPublishedAt || 
                     item.snippet.publishedAt || "",
        };
      })
      .filter(Boolean);
    
    console.log(`[EssKey] YouTube API: fetched ${videos.length} videos`);
    return videos;
    
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`YouTube API timeout after ${CONFIG.API_TIMEOUT}ms`);
    }
    throw err;
  }
}

/**
 * RSS proxy sources as FALLBACK when YouTube API fails.
 * Limited to ~15 videos by YouTube's RSS feed.
 */
const RSS_SOURCES = [
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
      if (json.status === "error") {
        throw new Error(json.message || "RSS2JSON API error");
      }
      if (!json.items?.length) throw new Error("No items in feed");
      return json.items.map((item) => {
        if (!item.link) return null;
        return {
          id:        extractVideoId(item.link),
          title:     item.title || "Untitled",
          url:       item.link,
          thumbnail: item.thumbnail || item.enclosure?.link || "",
          published: item.pubDate || "",
        };
      }).filter(Boolean);
    },
  },
];

/**
 * Try a single RSS data source. Aborts after timeout.
 */
async function tryRSSSource(src) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CONFIG.RSS_TIMEOUT);
  try {
    const res = await fetch(src.url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const videos = await src.parse(data);
    if (!videos.length) throw new Error("Empty feed");
    return videos;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`Timeout after ${CONFIG.RSS_TIMEOUT}ms`);
    }
    throw err;
  }
}

/**
 * Fallback to RSS when YouTube API fails.
 */
async function fetchViaRSS() {
  const results = await Promise.all(
    RSS_SOURCES.map((s) => tryRSSSource(s).catch((err) => {
      console.warn(`[EssKey] RSS ${s.name} failed:`, err.message);
      return null;
    }))
  );
  
  for (const r of results) {
    if (r?.length) {
      console.log(`[EssKey] RSS fallback: ${r.length} videos`);
      return r;
    }
  }
  
  throw new Error("All RSS sources failed");
}

/**
 * Fetch latest videos. Strategy:
 *  1. Check localStorage cache
 *  2. Try YouTube Data API v3 (PRIMARY - up to 50 videos)
 *  3. Fallback to RSS proxies (LIMITED - ~15 videos)
 *  4. Filter out "RADIO 24/7" streams
 *  5. Cache the result
 */
async function fetchYouTubeVideos() {
  // 1. Cache hit?
  const cached = cacheGet(CACHE_KEY, CACHE_TTL);
  if (cached?.length) {
    console.log(`[EssKey] Using cached data (${cached.length} videos)`);
    return cached;
  }

  let videos = null;
  let source = "none";
  
  // 2. Try YouTube API first (PRIMARY)
  try {
    videos = await fetchViaYouTubeAPI();
    source = "YouTube API";
  } catch (err) {
    console.warn(`[EssKey] YouTube API failed:`, err.message);
    
    // 3. Fallback to RSS
    try {
      videos = await fetchViaRSS();
      source = "RSS";
    } catch (rssErr) {
      console.warn(`[EssKey] RSS fallback failed:`, rssErr.message);
    }
  }
  
  // 4. Filter streams and apply limit
  if (videos?.length) {
    const totalFetched = videos.length;
    const filtered = videos.filter((v) => !v.title.toUpperCase().startsWith("RADIO 24/7"));
    const streamsFiltered = totalFetched - filtered.length;
    const limited = CONFIG.MAX_VIDEOS ? filtered.slice(0, CONFIG.MAX_VIDEOS) : filtered;
    
    console.log(`[EssKey] ${source}: ${totalFetched} fetched, ${streamsFiltered} streams filtered, ${limited.length} videos`);
    
    if (limited.length) {
      cacheSet(CACHE_KEY, limited);
      return limited;
    }
  }
  
  // 5. Try stale cache as last resort
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
  
  throw new Error("Failed to fetch videos from all sources. Check your connection.");
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
  
  if (errorMsg.includes("quota")) {
    message.textContent = "API quota exceeded. Please try again later.";
  } else if (errorMsg.includes("Timeout")) {
    message.textContent = "The request took too long. Please check your connection.";
  } else if (errorMsg.includes("Network") || errorMsg.includes("fetch")) {
    message.textContent = "Unable to reach the server. Check your internet connection.";
  } else {
    message.textContent = "Something went wrong while loading videos.";
  }
  
  const retryBtn = document.createElement("button");
  retryBtn.className = "btn btn-line";
  retryBtn.textContent = "Try Again";
  retryBtn.style.cssText = "cursor:pointer;";
  retryBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem(CONFIG.CACHE_KEY);
    } catch (e) {}
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
  if (!isValidHttpUrl(url)) return;
  
  const a = document.createElement("a");
  a.className   = "flyout-link";
  a.href        = url;
  a.target      = "_blank";
  a.rel         = "noopener noreferrer";
  a.textContent = title || "Video";
  flyout.appendChild(a);
}

/** Create and append a media card to a grid container. */
function appendMediaCard(container, video) {
  const { id, title, url, thumbnail } = video;
  
  const safeVideoUrl = isValidHttpUrl(url) ? url : id ? `https://youtu.be/${id}` : "";
  const bgUrl = isValidHttpUrl(thumbnail) ? thumbnail : coverUrl(id);

  const card = document.createElement("article");
  card.className = "media-card reveal";
  
  const escapedBgUrl = bgUrl.replace(/[\\"']/g, (match) => {
    const escapes = { '"': '\\"', "'": "\\'", "\\": "\\\\" };
    return escapes[match] || match;
  });
  card.style.setProperty("--bg", `url('${escapedBgUrl}')`);
  
  if (safeVideoUrl) {
    card.addEventListener("click", () => window.open(safeVideoUrl, "_blank", "noopener"));
  }

  const body = document.createElement("div");
  body.className = "media-card-body";

  const titleEl = document.createElement("h3");
  titleEl.className = "media-title";
  titleEl.textContent = title || "Untitled video";

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
 */
function renderVideos(videos) {
  clearSkeletons($videoList);
  $videoList.innerHTML = "";
  if ($videoFlyout) $videoFlyout.innerHTML = "";

  const cards = videos.map((v) => appendMediaCard($videoList, v));

  if ($videoFlyout) {
    for (const v of videos) appendFlyoutLink($videoFlyout, v);
  }

  if (cards.length <= VISIBLE_VIDEO_COUNT) return;

  cards.forEach((card, i) => {
    if (i >= VISIBLE_VIDEO_COUNT) card.classList.add("is-hidden-card");
  });

  document.getElementById("showMoreBtn")?.remove();

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

document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${Math.min(i * 50, 200)}ms`;
  revealObs.observe(el);
});


/* ─── 7. Background Video Fallback ─────────────────────────────────────── */

const $pageBg = document.querySelector(".page-bg");
const $bgVideo = document.querySelector(".page-bg-video");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initBgVideo() {
  if (!$bgVideo || reducedMotion) return;
  if (!$bgVideo.paused) return;

  $bgVideo.play().then(() => {
    console.log("[EssKey] BG video playing");
  }).catch(() => {
    console.log("[EssKey] BG video blocked, waiting for user interaction");
    const retry = () => {
      $bgVideo.play().catch(() => {});
    };
    document.addEventListener("touchstart", retry, { once: true, passive: true });
    document.addEventListener("click", retry, { once: true, passive: true });
  });
}


/* ─── 8. Featured YouTube Player ───────────────────────────────────────── */

const $playerHost    = document.getElementById("featuredPlayer");
const $playerFallback = document.getElementById("playerFallback");
const $playerPlayBtn  = document.getElementById("playerPlayBtn");

let playerLoaded  = false;
let latestVideos   = [];

if ($playerPlayBtn) $playerPlayBtn.classList.add("is-visible");

function bootPlayer(videoId, videoUrl) {
  if (!$playerHost) return;
  
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    console.error("[EssKey] Invalid video ID:", videoId);
    return;
  }
  
  if ($playerFallback && isValidHttpUrl(videoUrl)) {
    $playerFallback.href = videoUrl;
  }

  playerLoaded = true;
  $playerHost.innerHTML = "";

  const iframe = document.createElement("iframe");
  iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1&modestbranding=1`;
  iframe.allow = "autoplay; encrypted-media";
  iframe.allowFullscreen = true;
  iframe.style.cssText = "width:100%;height:100%;border:0;position:absolute;inset:0";
  $playerHost.appendChild(iframe);
}

function tryAutoBoot() {
  if (latestVideos.length && !playerLoaded) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bootPlayer(latestVideos[0].id, latestVideos[0].url);
        if ($playerPlayBtn) $playerPlayBtn.classList.remove("is-visible");
        if ($playerFallback) $playerFallback.classList.add("is-visible");
      });
    });
  }
}

if ($playerPlayBtn) {
  $playerPlayBtn.addEventListener("click", () => {
    if (!latestVideos.length) return;
    const v = latestVideos[0];
    bootPlayer(v.id, v.url);
    $playerPlayBtn.classList.remove("is-visible");
    if ($playerFallback) $playerFallback.classList.add("is-visible");
  });
}


/* ─── 9. Contact Form ──────────────────────────────────────────────────── */

const $form   = document.getElementById("contactForm");
const $status = document.getElementById("formStatus");

if ($form && $status) {
  const $nameField = $form.querySelector("#name");
  const $emailField = $form.querySelector("#email");
  const $msgField = $form.querySelector("#message");
  
  let statusTimeout = null;

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

  $form.addEventListener("submit", (e) => {
    e.preventDefault();
    
    const name  = $nameField.value.trim();
    const email = $emailField.value.trim();
    const msg   = $msgField.value.trim();

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

    const subj = encodeURIComponent(`EssKey Music Contact Form — ${name}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}`);
    const mailtoLink = `mailto:EssKey_YTB@protonmail.com?subject=${subj}&body=${body}`;
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    try {
      window.location.href = mailtoLink;
      showStatus(
        isMobile 
          ? "Opening your email app... If nothing happens, please email us directly."
          : "Your email program should open now. If it doesn't, please copy the email address above.",
        "success",
        8000
      );
      
      setTimeout(() => {
        $form.reset();
      }, 1000);
      
    } catch (err) {
      console.error("[EssKey] Mailto error:", err);
      showStatus(
        "Could not open email client. Please email us directly at EssKey_YTB@protonmail.com",
        "error",
        0
      );
    }
  });
}


/* ─── 10. Preloader ────────────────────────────────────────────────────── */

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

  function reveal() {
    if (finished) return;
    finished = true;
    setPct(100);
    $preloader.classList.add("is-hidden");
    document.body.classList.remove("is-loading");
    setTimeout(resolveFn, 600);
  }

  const ramp = setInterval(() => {
    pct += Math.random() * 5 + 1;
    if (pct > 40) pct = 40;
    setPct(pct);
  }, 120);

  fontsReady.then(() => {
    clearInterval(ramp);
    if (pct < 60) setPct(60);
  });

  dataReady.then(() => {
    clearInterval(ramp);
    const from    = Math.max(pct, 60);
    const start   = performance.now();
    const duration = 500;
    function animate(now) {
      const t    = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setPct(from + (100 - from) * ease);
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        reveal();
      }
    }
    requestAnimationFrame(animate);
  }).catch(() => {
    reveal();
  });

  setTimeout(reveal, CONFIG.PRELOADER_MAX_TIME);

  return done;
}


/* ─── 11. Parallax Background ──────────────────────────────────────────── */

function initParallax() {
  if (!$pageBg || reducedMotion) return;

  let currentY = 0;
  let targetY  = 0;
  let ticking  = false;

  function update() {
    currentY += (targetY - currentY) * 0.1;
    if (Math.abs(targetY - currentY) < 0.05) currentY = targetY;
    $pageBg.style.transform = `translate3d(0, ${currentY}px, 0)`;
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    targetY = window.scrollY * CONFIG.PARALLAX_FACTOR;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
}


/* ─── 12. Bootstrap (Entry Point) ──────────────────────────────────────── */

renderStreams(STREAMS);
renderSkeletons($videoList, VISIBLE_VIDEO_COUNT);

const fontsReady = document.fonts?.ready || Promise.resolve();

const dataReady = fetchYouTubeVideos()
  .then((videos) => {
    console.log(`[EssKey] Loaded ${videos.length} videos. Latest: "${videos[0]?.title}"`);
    latestVideos = videos;
    renderVideos(videos);
    return videos;
  })
  .catch((err) => {
    console.error("[EssKey] Fetch failed:", err.message);
    clearSkeletons($videoList);
    renderErrorState($videoList, err.message);
    return [];
  });

runPreloader(fontsReady, dataReady).then(() => {
  initBgVideo();
  initParallax();
  tryAutoBoot();
  dataReady.then(tryAutoBoot);
});

/* ─── Streams Data (hardcoded) ────────────────────────────────────────── */

const STREAMS = [
  { id: "RJtt_Jd9Uns", title: "RADIO 24/7 | Downtempo for Coding, Work & Inner Flow",           url: "https://www.youtube.com/live/RJtt_Jd9Uns", thumbnail: "https://i.ytimg.com/vi/RJtt_Jd9Uns/hqdefault.jpg" },
  { id: "Y0BSnmYRh_8", title: "RADIO 24/7 | Organic House For Deep working, Art & Design Works", url: "https://www.youtube.com/live/Y0BSnmYRh_8", thumbnail: "https://i.ytimg.com/vi/Y0BSnmYRh_8/hqdefault.jpg" },
];
