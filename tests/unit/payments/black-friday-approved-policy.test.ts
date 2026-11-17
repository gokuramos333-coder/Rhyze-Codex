import { expect, it } from 'vitest';
import { assessNewFriend } from '@/lib/payments/black-friday-new-friend';
it('requires the buyer declaration and permits absent history only with it', () => {
  const friend = { fullName: 'Fresh Friend', phone: '2015550190' };
  expect(assessNewFriend(friend, 'buyer', [], true).status).toBe('ELIGIBLE');
  expect(assessNewFriend(friend, 'buyer', [], false).status).toBe('DECLARATION_REQUIRED');
});
it('permits a uniquely matched unvisited account on declaration, never an ambiguous or returning identity', () => {
  const friend = { fullName: 'Fresh Friend', phone: '2015550190' };
  const candidate = { id: 'guest', name: friend.fullName, phone: friend.phone, attended: false, unresolvedPastBooking: false, importedWorkouts: 0, importedLastWorkoutAt: null };
  expect(assessNewFriend(friend, 'buyer', [candidate], true).status).toBe('ELIGIBLE');
  expect(assessNewFriend(friend, 'buyer', [{ ...candidate, attended: true }], true).status).toBe('INELIGIBLE');
  expect(assessNewFriend(friend, 'buyer', [candidate, { ...candidate, id: 'other' }], true).status).toBe('REVIEW_REQUIRED');
});
