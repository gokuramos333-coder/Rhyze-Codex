export function emailDeliveryEnabled(value = process.env.EMAIL_DELIVERY_ENABLED) {
  return value === 'true';
}

export function emailDeliveryResumeAt(
  value = process.env.EMAIL_DELIVERY_RESUME_AT,
) {
  if (!value) return null;

  const resumeAt = new Date(value);
  return Number.isNaN(resumeAt.getTime()) ? null : resumeAt;
}
