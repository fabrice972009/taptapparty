import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:admin@itstaptap.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { title, body, url } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Missing title or body' });

  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    }
  });
  const subs = await r.json();
  if (!Array.isArray(subs) || !subs.length) return res.status(200).json({ sent: 0, total: 0 });

  const payload = JSON.stringify({
    title,
    body,
    url: url || 'https://itstaptap.com',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png'
  });

  let sent = 0;
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, payload);
      sent++;
    } catch(err) {
      if (err.statusCode === 410) {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
          method: 'DELETE',
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
          }
        });
      }
    }
  }));

  res.status(200).json({ sent, total: subs.length });
}
