CREATE TABLE "EventRefundApproval" (
 "orderId" text PRIMARY KEY REFERENCES "CommerceOrder"(id),
 "actorId" text NOT NULL REFERENCES "User"(id),
 reason text NOT NULL,
 "paymentIntentId" text NOT NULL UNIQUE,
 "chargeId" text NOT NULL UNIQUE,
 "amountCents" integer NOT NULL CHECK ("amountCents">0),
 currency text NOT NULL CHECK (currency='usd'),
 "refundedBeforeCents" integer NOT NULL CHECK ("refundedBeforeCents">=0),
 "providerKey" text NOT NULL UNIQUE,
 "approvedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION immutable_event_refund_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Event refund approval is immutable; reconcile the existing provider operation'; END $$;
CREATE TRIGGER "EventRefundApprovalImmutable" BEFORE UPDATE OR DELETE ON "EventRefundApproval"
FOR EACH ROW EXECUTE FUNCTION immutable_event_refund_approval();
