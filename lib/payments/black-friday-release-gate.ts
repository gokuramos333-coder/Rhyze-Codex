/** Enable only after the reviewed runtime-retirement and checkout-liability checks. */
export function blackFridaySalesEnabled() {
  return process.env.RHYZE_BLACK_FRIDAY_SALES_ENABLED === 'true';
}
