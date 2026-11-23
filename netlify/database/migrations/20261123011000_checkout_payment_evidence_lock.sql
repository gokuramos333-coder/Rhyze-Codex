-- The nullable order FK cannot serialize session-only ledger evidence.
-- Physical versions also invalidate old REPEATABLE READ/SERIALIZABLE snapshots.
CREATE TABLE "CheckoutPaymentEvidenceFence" (
  identity TEXT PRIMARY KEY,
  revision BIGINT NOT NULL
);

-- Take these rows after existing financial/ledger and parent locks. Acquire
-- order, intent, session consistently. An unpaid decision never writes the ledger.
CREATE FUNCTION bf_lock_checkout_evidence(oid text, intent text, session_id text)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO "CheckoutPaymentEvidenceFence" AS fence (identity, revision)
  SELECT k, 1 FROM (VALUES
    (1, 'order:' || oid), (2, 'intent:' || intent), (3, 'session:' || session_id)
  ) AS keys(position,k) WHERE k IS NOT NULL ORDER BY position
  ON CONFLICT (identity) DO UPDATE SET revision=fence.revision+1;
$$;

CREATE FUNCTION bf_fence_collected_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'FAILED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'FAILED'
     AND (OLD."commerceOrderId", OLD."stripePaymentIntentId", OLD."stripeCheckoutSessionId")
         IS NOT DISTINCT FROM (NEW."commerceOrderId", NEW."stripePaymentIntentId", NEW."stripeCheckoutSessionId")
  THEN RETURN NEW; END IF;
  -- Acquire the referenced parent's FK lock before the evidence keys.
  IF NEW."commerceOrderId" IS NOT NULL THEN
    PERFORM id FROM "CommerceOrder" WHERE id=NEW."commerceOrderId" FOR KEY SHARE;
  END IF;
  PERFORM bf_lock_checkout_evidence(NEW."commerceOrderId", NEW."stripePaymentIntentId", NEW."stripeCheckoutSessionId");
  RETURN NEW;
END;
$$;

CREATE TRIGGER bf_collected_payment_evidence
BEFORE INSERT OR UPDATE OF status, "commerceOrderId", "stripePaymentIntentId", "stripeCheckoutSessionId"
ON "PaymentRecord" FOR EACH ROW EXECUTE FUNCTION bf_fence_collected_payment();
