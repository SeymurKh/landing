// Vercel Serverless Function
// Fetches YouTube RSS server-side — NO CORS issues!

const CHANNEL_ID = "UCa9kWM8BbmFi5OpXbjyqk9w";
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

module.exports = async function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Cache for 5 minutes in browser
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");

  try {
    const response = await fetch(RSS_URL, {
      headers: {
        "User-Agent": "EssKeyMusic-Landing/1.0",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`YouTube RSS returned ${response.status}`);
    }

    const xml = await response.text();
    const doc = new DOMParser().parseFromString(xml, "text/xml");

    // Check for XML parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      throw new Error("Failed to parse YouTube RSS XML");
    }

    // Extract video entries
    const entries = [...doc.querySelectorAll("entry")];

    const videos = entries.map((e) => {
      const id = e.querySelector("videoId")?.textContent || "";
      const title = e.querySelector("title")?.textContent || "";
      const published = e.querySelector("published")?.textContent || "";
      const mediaGroup = e.querySelector("group");
      const thumbnail = mediaGroup?.querySelector("thumbnail")?.getAttribute("url") || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      return {
        id,
        title,
        url: `https://youtu.be/${id}`,
        thumbnail,
        published,
      };
    });

    return res.status(200).json({
      ok: true,
      channel: CHANNEL_ID,
      count: videos.length,
      updated: new Date().toISOString(),
      videos,
    });
  } catch (err) {
    console.error("/api/youtube error:", err.message);
    return res.status(502).json({
      ok: false,
      error: err.message,
      videos: [],
    });
  }
};
