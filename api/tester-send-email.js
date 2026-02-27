import { Resend } from 'resend';
import { readJsonBody, sendJson } from './http.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const resendClient = apiKey ? new Resend(apiKey) : null;

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Invalid JSON body.' });
  }

  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';

  const fromAddress = process.env.MAIL_FROM || 'Bhanoyi Secondary School <no-reply@example.com>';
  const toAddress = to || process.env.MAIL_TO;

  if (!resendClient) {
    return sendJson(response, 500, { error: 'RESEND_API_KEY is missing; update environment and redeploy.' });
  }

  if (!toAddress) {
    return sendJson(response, 400, { error: 'Destination email is required (either in the form or MAIL_TO)' });
  }

  try {
    const emailResult = await resendClient.emails.send({
      from: fromAddress,
      to: toAddress,
      subject: subject || 'Resend Test Email',
      html: message ? `<p>${message}</p>` : '<p>Hello! This is a Resend test email from the Bhanoyi test harness.</p>'
    });

    return sendJson(response, 200, { ok: true, id: emailResult?.id || emailResult?.data?.id || null });
  } catch (err) {
    console.error('Resend send error:', err);
    return sendJson(response, 500, { error: err?.message || 'Failed to send email via Resend.' });
  }
}