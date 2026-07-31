import webpush from 'web-push';

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;

webpush.setVapidDetails(
  'mailto:admin@itstaptap.com',
  VAPID_PUBLIC,
  VAPID_PRIVATE
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, body, url } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Missing title or body' });

  // Get all subscriptions from Supabase
  const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  const subs = await r.json();

  const payload = JSON.stringify({
    title,
    body,
    url: url || 'https://itstaptap.com',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png'
  });

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, payload).catch(async err => {
        // Remove expired subscriptions
        if (err.statusCode === 410) {
          await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
          });
        }
      })
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  res.status(200).json({ sent, total: subs.length });
}
