export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { endpoint, keys } = req.body;
  if (!endpoint || !keys) return res.status(400).json({ error: 'Missing data' });

  await fetch(`${process.env.SUPABASE_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
  });

  res.status(200).json({ success: true });
}
