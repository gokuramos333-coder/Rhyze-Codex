ALTER TABLE "WaiverAcceptance"
ADD COLUMN "mediaConsent" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WaiverVersion" SET "isActive" = false WHERE "isActive" = true;

INSERT INTO "WaiverVersion" (
  "id",
  "version",
  "title",
  "body",
  "effectiveAt",
  "isActive",
  "requiresSign",
  "createdAt",
  "updatedAt"
)
SELECT
  'rhyze-agreement-2026-07-23',
  COALESCE(MAX("version"), 0) + 1,
  'Rhyze Fitness Waiver and Studio Policies',
  $agreement$
WAIVER AND ASSUMPTION OF RISK
I understand that dance, yoga, Pilates, strength, HIIT, and related fitness activities involve physical exertion and inherent risks, including serious injury. I voluntarily participate, accept those risks, confirm that I am physically able to participate, and release Rhyze Fitness, its owners, staff, and instructors from claims to the fullest extent permitted by law. This agreement does not waive rights that cannot legally be waived.

CANCELLATION FOR CLASSES
Contact Rhyze through the website messaging chat to request a transfer within 2 weeks. Cancellations more than 6 hours before class are eligible for transfer without a fee. Cancellations within 6 hours require a $10 transfer fee. Cancellations 2 hours or less before class are not eligible for transfer and may be marked late cancel or no-show. The official cancellation window is 6 hours before class start time. VIP Access transfer fees are waived.

WEATHER AND EMERGENCY CLOSURES
When Rhyze cancels for severe weather, unsafe conditions, utility failure, government restriction, instructor emergency, or another event outside reasonable control, Rhyze will restore the class credit or offer a fee-free transfer. A member who reasonably believes conditions are unsafe to travel may promptly request a weather exception; Rhyze may approve a fee-free transfer based on official alerts, road conditions, timing, location, and the circumstances. A general State of Emergency does not always prohibit travel. Rhyze may cancel, delay, relocate, shorten, substitute an instructor, or move a class online. Updates may be sent by email, enabled SMS, website, or member portal.

REFUNDS AND MEMBERSHIP CANCELLATION
Classes, events, and workshops are non-refundable except where required by law or expressly approved. Special events and collaboration classes are non-transferable unless stated otherwise. Statutory cancellation rights control over conflicting studio wording. Eligible New Jersey health-club contracts may include specific cancellation, relocation, disability, closure, and online termination rights in the membership agreement.

LATE BOOKING
Online booking closes 30 minutes before class. Drop-ins are permitted if space is available. Check the website or portal before traveling.

PRIVATE GROUP PARTIES
A $100 deposit is required and applies to the final balance. Cancellations less than 72 hours before the appointment incur a fee equal to the deposit. Earlier cancellations may use the deposit as a credit.

AGE REQUIREMENTS
All participants must be 12 or older. Anyone under 18 requires a parent or guardian to sign in person before participation.

HEALTH AND SAFETY
Stay home when unwell. Tell the instructor about injuries, pregnancy, limitations, or relevant health concerns. Stop exercising and seek appropriate help for concerning symptoms.

CONDUCT AND STUDIO SAFETY
Treat people, facilities, and equipment respectfully. Rhyze may refuse entry or remove a person for harassment, threats, intoxication, unsafe behavior, material disruption, or failure to follow safety instructions.

PERSONAL PROPERTY
Members are responsible for belongings. Rhyze is not responsible for lost, stolen, or damaged property except where liability cannot legally be excluded.

ELECTRONIC SIGNATURE AND POLICY UPDATES
Checking the agreement box and selecting Accept and digitally sign is an electronic signature and consent to electronic records. Rhyze retains the accepted version, account, timestamp, and available technical evidence. Material changes require acceptance of a new version before booking.

PHOTOGRAPHY AND MEDIA
Media permission is optional. Declining media consent does not affect booking access.
$agreement$,
  NOW(),
  true,
  true,
  NOW(),
  NOW()
FROM "WaiverVersion";
