import { sendEmail } from './mailer.js';
import { normalize, readJsonBody, sendJson } from './http.js';

const cleanText = (value, maxLength = 5000) => normalize(value).slice(0, maxLength);

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  const apiKey = normalize(process.env.RESEND_API_KEY);
  const toAddress = normalize(process.env.RESEND_ADMISSIONS_TO) || normalize(process.env.RESEND_DEFAULT_TO) || normalize(process.env.MAIL_TO);

  if (!apiKey) {
    return sendJson(response, 500, { error: 'RESEND_API_KEY is missing; update environment and redeploy.' });
  }

  if (!toAddress) {
    return sendJson(response, 400, { error: 'Destination email is required (RESEND_ADMISSIONS_TO or RESEND_DEFAULT_TO).' });
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Invalid JSON body.' });
  }

  const guardianName = cleanText(body?.guardianName, 120);
  const studentName = cleanText(body?.studentName, 120);
  const applyingGrade = cleanText(body?.applyingGrade, 40);
  const email = cleanText(body?.email, 200);
  const phone = cleanText(body?.phone, 80);
  const message = cleanText(body?.message, 4000);
  const website = cleanText(body?.website, 120);

  if (website) {
    return sendJson(response, 200, { ok: true });
  }

  if (!guardianName || !studentName || !applyingGrade || !email || !phone) {
    return sendJson(response, 400, { error: 'Guardian name, student name, grade, email, and phone are required.' });
  }

  if (!isValidEmail(email)) {
    return sendJson(response, 400, { error: 'Please provide a valid email address.' });
  }

  const submittedAt = new Date().toISOString();

  try {
    const emailResult = await sendEmail({
      to: toAddress,
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

    return sendJson(response, 200, { ok: true, id: emailResult?.id || emailResult?.data?.id || null });
  } catch (err) {
    return sendJson(response, 500, { error: err?.message || 'Failed to send email via Resend.' });
  }
}