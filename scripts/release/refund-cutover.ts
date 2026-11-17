/** This checkout has no verified host mechanism for old immutable/skew ingress
 * exclusion AND in-flight drain. No local flag, timestamp or idle SQL is proof.
 * Replace this hold only with a reviewed supported mechanism and native receipts.
 */
export function assertControlledRefundCutover(changes: string[]) {
  if (changes.some((path) => path.includes('20261113010000_refund_review')))
    throw Error(
      'Refund cutover blocked: supported old immutable/skew ingress exclusion and in-flight drain have not been established. Publication lock or a new-app flag is insufficient.',
    );
}
