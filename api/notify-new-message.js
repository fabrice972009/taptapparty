// Called by a Supabase Database Webhook whenever a new row is inserted
// into contact_messages. Sends a real push notification to whoever has
// enabled admin alerts (stored in admin_push_subscriptions) — this fires
// even if admin.html isn't open, same as the existing visitor broadcast
// in send-notification.js, just aimed at a separate, admin-only list of
// subscribers.
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:admin@itstaptap.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Optional shared-secret check so random requests to this URL can't
  // trigger a push. Only enforced if NOTIFY_WEBHOOK_SECRET is set in
  // Vercel — leave it unset if you don't want this check.
  if (
    process.env.NOTIFY_WEBHOOK_SECRET &&
    req.headers['x-webhook-secret'] !== process.env.NOTIFY_WEBHOOK_SECRET
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const record = req.body?.record;
  if (!record) return res.status(400).json({ error: 'Missing record' });

  const name = [record.first_name, record.last_name].filter(Boolean).join(' ') || 'Someone';
  const preview = (record.message || '').slice(0, 120);

  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/admin_push_subscriptions?select=*`, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    }
  });
  const subs = await r.json();
  if (!Array.isArray(subs) || !subs.length) return res.status(200).json({ sent: 0, total: 0 });

  const payload = JSON.stringify({
    title: `💬 New message from ${name}`,
    body: preview,
    url: 'https://itstaptap.com/admin.html',
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
    } catch (err) {
      if (err.statusCode === 410) {
        await fetch(`${process.env.SUPABASE_URL}/rest/v1/admin_push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
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
