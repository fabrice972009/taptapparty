export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        email: email,
        listIds: [3],
        updateEnabled: true
      })
    });

    const data = await response.json();

    // 204 = success, 400 with duplicate = already subscribed
    if (response.ok || response.status === 204) {
      return res.status(200).json({ success: true });
    } else if (data.code === 'duplicate_parameter') {
      return res.status(200).json({ success: true, duplicate: true });
    } else {
      return res.status(500).json({ error: 'Brevo error', details: data });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
