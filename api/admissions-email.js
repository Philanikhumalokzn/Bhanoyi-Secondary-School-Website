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

const sendEmail = async ({ apiKey, payload }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const reason = normalize(data?.message) || normalize(data?.error?.message) || 'Email provider request failed.';
    throw new Error(reason);
  }
};

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  const apiKey = normalize(process.env.RESEND_API_KEY);
  const from = normalize(process.env.RESEND_FROM);
  const defaultTo = normalize(process.env.RESEND_DEFAULT_TO);
  const to = normalize(process.env.RESEND_ADMISSIONS_TO) || defaultTo;
  const schoolName = normalize(process.env.SCHOOL_NAME) || 'Bhanoyi Secondary School';

  if (!apiKey || !from || !to) {
    return json(500, { error: 'Server email configuration is incomplete.' });
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
    await sendEmail({
      apiKey,
      payload: {
        from,
        to: [to],
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
      }
    });

    await sendEmail({
      apiKey,
      payload: {
        from,
        to: [email],
        subject: `${schoolName} admissions enquiry received`,
        html: `
          <p>Hello ${escapeHtml(guardianName)},</p>
          <p>Thank you for your admissions enquiry for <strong>${escapeHtml(studentName)}</strong> (Grade ${escapeHtml(applyingGrade)}).</p>
          <p>The admissions office has received your details and will contact you about next steps.</p>
          <p>Regards,<br />${escapeHtml(schoolName)} Admissions Office</p>
        `,
        text: [
          `Hello ${guardianName},`,
          `Thank you for your admissions enquiry for ${studentName} (Grade ${applyingGrade}).`,
          'The admissions office has received your details and will contact you about next steps.',
          '',
          'Regards,',
          `${schoolName} Admissions Office`
        ].join('\n')
      }
    });
  } catch (error) {
    const reason = normalize(error?.message) || 'Unable to send email right now.';
    return json(502, { error: reason });
  }

  return json(200, { ok: true });
}