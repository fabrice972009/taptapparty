// Saves a push subscription for the ADMIN dashboard, separate from the
// visitor-facing push_subscriptions table (so admin alerts never fan out
// to regular site visitors). Mirrors the request/auth style already used
// by save-subscription.js.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/admin_push_subscriptions`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth
    })
  });

  if (!r.ok) {
    const text = await r.text();
    return res.status(500).json({ error: text });
  }

  res.status(200).json({ ok: true });
}
