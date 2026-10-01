import type { CSSProperties } from 'react';
import type { Customer } from '@/lib/newsletters/domain';

const tones = {
  red: { backgroundColor: '#FDE8E5', color: '#8A2D25', borderColor: '#E9B6AF' },
  green: {
    backgroundColor: '#E7F4E7',
    color: '#285C35',
    borderColor: '#ABD3AF',
  },
  yellow: {
    backgroundColor: '#FFF5CC',
    color: '#705617',
    borderColor: '#E7D38D',
  },
  blue: {
    backgroundColor: '#E8F1FC',
    color: '#2A517C',
    borderColor: '#B8CEE9',
  },
  gray: {
    backgroundColor: '#EDEDEC',
    color: '#4C4C48',
    borderColor: '#C9C9C4',
  },
} satisfies Record<string, CSSProperties>;

export function contactStatusColors(outcome: string): CSSProperties {
  switch (outcome) {
    case 'NOT_CONTACTED':
    case 'NOT_INTERESTED':
      return tones.red;
    case 'INTERESTED':
    case 'CONVERTED':
      return tones.green;
    case 'NO_ANSWER':
    case 'LEFT_VOICEMAIL':
    case 'FOLLOW_UP_NEEDED':
    case 'WANTS_TO_JOIN_LATER':
      return tones.yellow;
    case 'SPOKE_WITH_CUSTOMER':
      return tones.blue;
    default:
      return tones.gray;
  }
}

export function membershipColors(
  customer: Pick<Customer, 'activeMember' | 'formerMember'>,
): CSSProperties {
  if (customer.activeMember) return tones.green;
  return customer.formerMember ? tones.red : tones.yellow;
}
