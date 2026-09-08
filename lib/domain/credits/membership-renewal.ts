type CreditEntry = { quantity: number };

function ledgerBalance(entries: CreditEntry[]) {
  return entries.reduce((total, entry) => total + entry.quantity, 0);
}

export function availableMembershipCredits(input: {
  entries: CreditEntry[];
  includedCredits: number | null;
}) {
  const balance = Math.max(0, ledgerBalance(input.entries));
  return input.includedCredits === null
    ? balance
    : Math.min(balance, input.includedCredits);
}

export function renewalCreditReset(input: {
  entries: CreditEntry[];
  includedCredits: number;
}) {
  const unusedCredits = Math.max(0, ledgerBalance(input.entries));
  return {
    expirationQuantity: unusedCredits === 0 ? 0 : -unusedCredits,
    grantQuantity: input.includedCredits,
  };
}
