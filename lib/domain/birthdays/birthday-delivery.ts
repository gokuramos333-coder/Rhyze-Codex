export function birthdayReminderExpired(message: {template:string; scheduledFor:Date}, now = new Date()) {
  return ['BIRTHDAY_MONTHLY_DIGEST','BIRTHDAY_WEEK_AHEAD'].includes(message.template) && now.getTime() - message.scheduledFor.getTime() >= 86400000;
}
