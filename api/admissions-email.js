import { Resend } from 'resend';

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
  const fromAddress = normalize(process.env.RESEND_FROM) || 'Bhanoyi Secondary School <no-reply@example.com>';
  const toAddress = normalize(process.env.RESEND_ADMISSIONS_TO) || normalize(process.env.RESEND_DEFAULT_TO);

  const resendClient = apiKey ? new Resend(apiKey) : null;

  if (!resendClient) {
    return json(500, { error: 'RESEND_API_KEY is missing; update environment and redeploy.' });
  }

  if (!toAddress) {
    return json(400, { error: 'Destination email is required (RESEND_ADMISSIONS_TO or RESEND_DEFAULT_TO).' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const guardianName = cleanText(body?.guardianName, 120);
  const studentName = cleanText(body?.studentName, 120);
  const applyingGrade = cleanText(body?.applyingGrade, 40);
  const email = cleanText(body?.email, 200);
  const phone = cleanText(body?.phone, 80);
  const message = cleanText(body?.message, 4000);
  const website = cleanText(body?.website, 120);

  if (website) {
    return json(200, { ok: true });
  }

  if (!guardianName || !studentName || !applyingGrade || !email || !phone) {
    return json(400, { error: 'Guardian name, student name, grade, email, and phone are required.' });
  }

  if (!isValidEmail(email)) {
    return json(400, { error: 'Please provide a valid email address.' });
  }

  const submittedAt = new Date().toISOString();

  try {
    const response = await resendClient.emails.send({
      from: fromAddress,
      to: toAddress,
      reply_to: email,
      subject: `Admissions enquiry: ${studentName} (Grade ${applyingGrade})`,
      html: `
        <h2>New admissions enquiry</h2>
        <p><strong>Guardian:</strong> ${escapeHtml(guardianName)}</p>
        <p><strong>Student:</strong> ${escapeHtml(studentName)}</p>
        <p><strong>Applying Grade:</strong> ${escapeHtml(applyingGrade)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
        <hr />
        <p>${escapeHtml(message || 'No additional notes.').replace(/\n/g, '<br />')}</p>
      `,
      text: [
        'New admissions enquiry',
        `Guardian: ${guardianName}`,
        `Student: ${studentName}`,
        `Applying Grade: ${applyingGrade}`,
        `Email: ${email}`,
        `Phone: ${phone}`,
        `Submitted: ${submittedAt}`,
        '',
        message || 'No additional notes.'
      ].join('\n')
    });

    return json(200, { ok: true, id: response?.id || response?.data?.id || null });
  } catch (err) {
    return json(500, { error: err?.message || 'Failed to send email via Resend.' });
  }
}