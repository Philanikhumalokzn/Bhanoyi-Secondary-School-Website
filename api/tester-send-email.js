import { Resend } from 'resend';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const resendClient = apiKey ? new Resend(apiKey) : null;

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';

  const fromAddress = process.env.MAIL_FROM || 'Bhanoyi Secondary School <no-reply@example.com>';
  const toAddress = to || process.env.MAIL_TO;

  if (!resendClient) {
    return json(500, { error: 'RESEND_API_KEY is missing; update environment and redeploy.' });
  }

  if (!toAddress) {
    return json(400, { error: 'Destination email is required (either in the form or MAIL_TO)' });
  }

  try {
    const response = await resendClient.emails.send({
      from: fromAddress,
      to: toAddress,
      subject: subject || 'Resend Test Email',
      html: message ? `<p>${message}</p>` : '<p>Hello! This is a Resend test email from the Bhanoyi test harness.</p>'
    });

    return json(200, { ok: true, id: response?.id || response?.data?.id || null });
  } catch (err) {
    console.error('Resend send error:', err);
    return json(500, { error: err?.message || 'Failed to send email via Resend.' });
  }
}