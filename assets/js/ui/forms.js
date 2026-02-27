const setFormStatus = (form, message, tone = 'muted') => {
  const status = form.querySelector('[data-form-status]');
  if (!status) return;
  status.textContent = message;
  status.setAttribute('data-tone', tone);
};

const setSubmittingState = (form, isSubmitting) => {
  const submitButton = form.querySelector('button[type="submit"]');
  if (!submitButton) return;

  if (!submitButton.dataset.defaultText) {
    submitButton.dataset.defaultText = submitButton.textContent || 'Submit';
  }

  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? 'Sending…' : submitButton.dataset.defaultText;
};

const collectFormData = (form) => {
  const fields = Array.from(form.querySelectorAll('[name]'));
  return fields.reduce((acc, field) => {
    const key = field.getAttribute('name');
    if (!key) return acc;
    acc[key] = typeof field.value === 'string' ? field.value.trim() : '';
    return acc;
  }, {});
};

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'Unable to send right now. Please try again.';
    throw new Error(message);
  }
};

const bindEmailForm = (form) => {
  const endpoint = form.dataset.endpoint;
  if (!endpoint) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFormStatus(form, '', 'muted');
    setSubmittingState(form, true);

    try {
      const payload = collectFormData(form);
      await postJson(endpoint, payload);
      form.reset();
      setFormStatus(form, 'Thanks, your message was sent successfully.', 'success');
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : 'Unable to send right now. Please try again.';
      setFormStatus(form, message, 'error');
    } finally {
      setSubmittingState(form, false);
    }
  });
};

export const initPageEmailForms = () => {
  const forms = Array.from(document.querySelectorAll('[data-email-form="true"]'));
  forms.forEach(bindEmailForm);
};

const bindGeminiTester = (form) => {
  const status = form.querySelector('[data-gemini-status]');
  const input = form.querySelector('input[name="prompt"]');
  const button = form.querySelector('button[type="submit"]');

  const setStatus = (message, tone = 'muted') => {
    if (!status) return;
    status.textContent = message;
    status.setAttribute('data-tone', tone);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('Testing Gemini key…', 'muted');

    if (button instanceof HTMLButtonElement) {
      button.disabled = true;
    }

    try {
      const prompt = typeof input?.value === 'string' ? input.value.trim() : '';
      const response = await fetch('/api/gemini-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload?.error === 'string' ? payload.error : 'Gemini test failed.';
        throw new Error(message);
      }

      const model = typeof payload?.model === 'string' ? payload.model : 'Gemini';
      const reply = typeof payload?.reply === 'string' ? payload.reply : 'No reply text returned.';
      setStatus(`✅ ${model} responded: ${reply}`, 'success');
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : 'Gemini test failed.';
      setStatus(`❌ ${message}`, 'error');
    } finally {
      if (button instanceof HTMLButtonElement) {
        button.disabled = false;
      }
    }
  });
};

export const initGeminiApiTester = () => {
  const form = document.querySelector('[data-gemini-tester="true"]');
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  bindGeminiTester(form);
};