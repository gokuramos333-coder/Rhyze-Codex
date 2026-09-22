import { describe, expect, it } from 'vitest';
import { callbackInputSchema } from '@/lib/domain/contact/callback-input';

export const validInput = {
  requestKey: '9a720260-510e-4e8f-80a3-dd0170f13a41',
  startAt: '2026-09-22T15:00:00.000Z',
  name: ' Prospect ',
  email: 'PROSPECT@example.test ',
  phone: '(973) 555-0100',
  message: 'Membership question',
  website: '',
};
describe('callback input', () => {
  it('normalizes identity and permits an optional question', () => {
    expect(
      callbackInputSchema.parse({ ...validInput, message: undefined }),
    ).toMatchObject({
      name: 'Prospect',
      email: 'prospect@example.test',
      message: '',
    });
  });
  it.each([
    { name: '' },
    { name: 'x'.repeat(121) },
    { email: 'not-an-email' },
    { phone: '123' },
    { phone: 'not-a-phone-number' },
    { phone: '+1 973 555 0100 ext 5' },
    { message: 'x'.repeat(2001) },
    { startAt: '2026-02-30T12:00:00.000Z' },
    { startAt: '2026-09-22T15:01:00.000Z' },
    { startAt: '2026-09-22T15:00:01.000Z' },
    { requestKey: 'guessable' },
    { website: 'spam.example' },
    { email: 'a@example.test\r\nBcc: stolen@example.test' },
  ])('rejects invalid/abusive input %j', (change) => {
    expect(
      callbackInputSchema.safeParse({ ...validInput, ...change }).success,
    ).toBe(false);
  });
});
