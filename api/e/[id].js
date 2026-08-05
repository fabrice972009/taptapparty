// Vercel Serverless Function
// File location in your repo: api/e/[id].js
//
// Purpose: gives every event a clean, shareable link (https://www.itstaptap.com/e/<id>)
// that shows the event's own flyer/title when pasted into Instagram, WhatsApp,
// iMessage, etc. Social apps "unfurl" links by fetching the URL with a bot and
// reading its <meta> tags — they never run JavaScript. Since the rest of this site
// is plain static HTML with client-side JS, a shared /event.html?id=... link would
// otherwise only ever show the site's generic preview card. This function detects
// that kind of bot request and serves the correct per-event meta tags directly,
// while sending real visitors straight on to the normal interactive page.

const SUPA_URL = 'https://rmzfowqzlqyzbjchpntv.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtemZvd3F6bHF5emJqY2hwbnR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NzQxODcsImV4cCI6MjA5OTA1MDE4N30.GB42OaMpcIt7uxopfPYEH4Vdatm7hYS37AptnivgUkU';

// User-agents used by the major link-preview crawlers.
const BOT_UA_REGEX = /facebookexternalhit|Facebot|Twitterbot|Slackbot|TelegramBot|WhatsApp|LinkedInBot|Discordbot|Googlebot|bingbot|Pinterest|redditbot|SkypeUriPreview|vkShare|Iframely|Embedly|Applebot/i;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// WhatsApp (unlike Facebook/iMessage) often refuses to render a link preview
// image unless og:image:width and og:image:height are present. We don't store
// dimensions in Supabase, so this reads just the image file's header bytes
// (not the whole file) and parses them out directly — no image libraries
// needed. Falls back to a sensible flyer-shaped default if parsing fails.
async function getImageDimensions(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const resp = await fetch(url, {
      headers: { Range: 'bytes=0-65535' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    const buf = Buffer.from(await resp.arrayBuffer());

    // PNG: 8-byte signature, then IHDR chunk holds width/height at fixed offsets.
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'image/png' };
    }

    // JPEG: scan markers for the SOF segment that carries dimensions.
    if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
      let offset = 2;
      while (offset < buf.length - 9) {
        if (buf[offset] !== 0xFF) { offset++; continue; }
        const marker = buf[offset + 1];
        if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7), type: 'image/jpeg' };
        }
        offset += 2 + buf.readUInt16BE(offset + 2);
      }
    }
  } catch (e) {
    // Network hiccup, timeout, or unsupported format — caller falls back.
  }
  return null;
}

export default async (req, res) => {
  const id = (req.query && req.query.id) || '';
  const userAgent = (req.headers && req.headers['user-agent']) || '';
  const isBot = BOT_UA_REGEX.test(userAgent);
  const destination = id ? `/event.html?id=${encodeURIComponent(id)}` : '/events.html';

  if (!id) {
    res.statusCode = 302;
    res.setHeader('Location', '/events.html');
    res.end();
    return;
  }

  // Real visitors: send them straight to the interactive page. No need to hit
  // Supabase here at all — event.html does its own live lookup.
  if (!isBot) {
    res.statusCode = 302;
    res.setHeader('Location', destination);
    res.end();
    return;
  }

  // Bot / crawler request: fetch the event and hand back real meta tags.
  let event = null;
  try {
    const resp = await fetch(
      `${SUPA_URL}/rest/v1/events?id=eq.${encodeURIComponent(id)}&select=*`,
      { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
    );
    const rows = await resp.json();
    event = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    event = null;
  }

  if (!event) {
    res.statusCode = 302;
    res.setHeader('Location', '/events.html');
    res.end();
    return;
  }

  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const d = new Date(event.event_date + 'T12:00:00');
  const dateStr = `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

  const title = `${event.name} — TapTap Party`;
  const description = `${dateStr}${event.city ? ' · ' + event.city : ''} — Get your tickets to this TapTap event.`;
  const image = event.flyer_url || 'https://taptapparty.vercel.app/og-image.png';
  const canonicalUrl = `https://www.itstaptap.com${destination}`;

  // WhatsApp needs width/height to reliably show the image. If there's no
  // custom flyer, we already know the default og-image.png is 1200x630.
  let imgWidth = 1200, imgHeight = 630, imgType = 'image/png';
  if (event.flyer_url) {
    const dims = await getImageDimensions(image);
    if (dims) {
      imgWidth = dims.width;
      imgHeight = dims.height;
      imgType = dims.type;
    } else {
      // Couldn't read the real file header in time — fall back to a
      // typical portrait flyer ratio rather than the wrong 1200x630 default.
      imgWidth = 1080;
      imgHeight = 1350;
      imgType = 'image/jpeg';
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:secure_url" content="${escapeHtml(image)}">
<meta property="og:image:width" content="${imgWidth}">
<meta property="og:image:height" content="${imgHeight}">
<meta property="og:image:type" content="${imgType}">
<meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(destination)}">
</head>
<body>
<p>${escapeHtml(title)}</p>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(destination)}">View event details</a></p>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
};
