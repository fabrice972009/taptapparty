import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:admin@itstaptap.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // Verify this is a Vercel cron request
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();

  // Get all unsent notifications that are due
  const r = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/scheduled_notifications?sent=eq.false&scheduled_at=lte.${now}&select=*`,
    {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    }
  );
  const notifications = await r.json();
  if (!notifications.length) return res.status(200).json({ sent: 0 });

  // Get all push subscriptions
  const sr = await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions?select=*`, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    }
  });
  const subs = await sr.json();

  let totalSent = 0;

  for (const notif of notifications) {
    const payload = JSON.stringify({
      title: notif.title,
      body: notif.body,
      url: notif.url || 'https://itstaptap.com',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png'
    });

    // Send to all subscribers
    await Promise.all(subs.map(async sub => {
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }, payload);
        totalSent++;
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

    // Mark as sent
    await fetch(`${process.env.SUPABASE_URL}/rest/v1/scheduled_notifications?id=eq.${notif.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sent: true, sent_at: now })
    });
  }

  res.status(200).json({ processed: notifications.length, sent: totalSent });
}
