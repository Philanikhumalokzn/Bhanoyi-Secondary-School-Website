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

const HANDLER_TIMEOUT_MS = 15000;
const RESEND_TIMEOUT_MS = 12000;

const withTimeout = (promise, timeoutMs, message) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        reject(new Error(message));
      }, timeoutMs);
    })
  ]);

const sendEmail = async ({ apiKey, payload }) => {
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  let response;

  try {
    response = await withTimeout(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      }),
      RESEND_TIMEOUT_MS,
      'Email provider timed out. Please try again.'
    );
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Email provider timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(abortTimeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = normalize(data?.message) || normalize(data?.error?.message) || 'Email provider request failed.';
    throw new Error(reason);
  }

  return data;
};

export default async function handler(request) {
  try {
    return await withTimeout(
      (async () => {
        if (request.method !== 'POST') {
          return json(405, { error: 'Method not allowed.' });
        }

        const apiKey = normalize(process.env.RESEND_API_KEY);
        const from = normalize(process.env.RESEND_FROM);
        const defaultTo = normalize(process.env.RESEND_DEFAULT_TO);
        const to = normalize(process.env.RESEND_CONTACT_TO) || defaultTo;

        if (!apiKey || !from || !to) {
          return json(500, { error: 'Server email configuration is incomplete.' });
        }

        let body;
        try {
          body = await withTimeout(request.json(), 3000, 'Request body read timed out.');
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

        const response = await sendEmail({
          apiKey,
          payload: {
            from,
            to,
            reply_to: email,
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
          }
        });

        return json(200, { ok: true, id: response?.id || null });
      })(),
      HANDLER_TIMEOUT_MS,
      'Function timed out before completion.'
    );
  } catch (error) {
    const reason = normalize(error?.message) || 'Unable to send email right now.';
    return json(504, { error: reason });
  }
}