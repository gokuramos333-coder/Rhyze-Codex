export async function markAttendanceAction(form: FormData) {
  window.dispatchEvent(new CustomEvent('preview-attendance', { detail: {
    bookingId: form.get('bookingId'), status: form.get('status'),
  } }));
}

export async function restoreCreditAction() {
  window.dispatchEvent(new CustomEvent('preview-action', { detail: 'Simulated credit restoration. No account was changed.' }));
}
