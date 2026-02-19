import { sendEmail } from './mailer.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });

const normalize = (value) => (typeof value === 'string' ? value.trim() : '');

const cleanText = (value, maxLength = 5000) => normalize(value).slice(0, maxLength);

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  const apiKey = normalize(process.env.RESEND_API_KEY);
  const toAddress = normalize(process.env.RESEND_CONTACT_TO) || normalize(process.env.RESEND_DEFAULT_TO) || normalize(process.env.MAIL_TO);

  if (!apiKey) {
    return json(500, { error: 'RESEND_API_KEY is missing; update environment and redeploy.' });
  }

  if (!toAddress) {
    return json(400, { error: 'Destination email is required (RESEND_CONTACT_TO or RESEND_DEFAULT_TO).' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const fullName = cleanText(body?.fullName, 120);
  const email = cleanText(body?.email, 200);
  const phone = cleanText(body?.phone, 80);
  const subject = cleanText(body?.subject, 180);
  const message = cleanText(body?.message, 4000);
  const website = cleanText(body?.website, 120);

  if (website) {
    return json(200, { ok: true });
  }

  if (!fullName || !email || !subject || !message) {
    return json(400, { error: 'Full name, email, subject, and message are required.' });
  }

  if (!isValidEmail(email)) {
    return json(400, { error: 'Please provide a valid email address.' });
  }

  const submittedAt = new Date().toISOString();
  const safeSubject = escapeHtml(subject);

  try {
    const response = await sendEmail({
      to: toAddress,
      subject: `Contact form: ${subject}`,
      html: `
        <h2>New contact message</h2>
        <p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
        <hr />
        <p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>
      `,
      text: [
        'New contact message',
        `Name: ${fullName}`,
        `Email: ${email}`,
        `Phone: ${phone || 'Not provided'}`,
        `Subject: ${subject}`,
        `Submitted: ${submittedAt}`,
        '',
        message
      ].join('\n')
    });

    return json(200, { ok: true, id: response?.id || response?.data?.id || null });
  } catch (err) {
    return json(500, { error: err?.message || 'Failed to send email via Resend.' });
  }
}