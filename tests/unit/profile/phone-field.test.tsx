// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PhoneField } from '@/components/domain/accounts/PhoneField';
afterEach(cleanup);
it('lets an unchanged invalid historical phone survive blur and unrelated submission', () => {
  render(
    <form>
      <PhoneField
        label="Phone"
        name="phone"
        defaultValue="legacy@example.com"
        preserveUnchanged
      />
    </form>,
  );
  const input = screen.getByLabelText('Phone') as HTMLInputElement;
  fireEvent.blur(input);
  expect(input.checkValidity()).toBe(true);
  fireEvent.change(input, { target: { value: 'new@example.com' } });
  expect(input.checkValidity()).toBe(false);
  fireEvent.change(input, { target: { value: 'legacy@example.com' } });
  expect(input.checkValidity()).toBe(true);
});
it('rejects letters and accepts international punctuation in a new phone', () => {
  render(<PhoneField label="Phone" name="phone" required />);
  const input = screen.getByLabelText('Phone') as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'abc@example.com' } });
  expect(input.checkValidity()).toBe(false);
  fireEvent.change(input, { target: { value: '+44 (20) 7946-0958' } });
  expect(input.checkValidity()).toBe(true);
});
