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
  'rhyze-agreement-attendance-2026-08-21',
  COALESCE(MAX("version"), 0) + 1,
  'Rhyze Fitness Waiver and Studio Policies',
  $agreement$
WAIVER AND ASSUMPTION OF RISK
I understand that dance, yoga, Pilates, strength, HIIT, and related fitness activities involve physical exertion and inherent risks, including serious injury. I voluntarily participate, accept those risks, confirm that I am physically able to participate, and release Rhyze Fitness, its owners, staff, and instructors from claims to the fullest extent permitted by law. This agreement does not waive rights that cannot legally be waived.

CANCELLATION FOR CLASSES
Submit every cancellation through My Bookings. A confirmation shows the exact credit and fee outcome before anything changes.

More than 6 hours before a standard class, a member may cancel with no fee and the reserved class credit is returned.

More than 2 hours through 6 hours before class, OG Rhyze Tribe, Elevate, Ritual, class-pack, and single-class clients may reschedule to an eligible class within 14 days for a $5 transfer fee. VIP clients may reschedule within 14 days with no transfer fee. Intro-trial clients receive an attendance reminder but are not charged in this window. A saved payment method is charged only after the new class is selected and confirmed.

2 hours or less before class, standard membership, class-pack, and single-class clients lose the reserved credit and are charged a $10 late-cancellation fee to the saved payment method. Intro-trial and VIP clients are also charged a $10 late-cancellation fee to the saved payment method.

No-shows are charged automatically to the saved payment method: $10 for standard clients, $10 for intro-trial clients, and $10 for VIP clients. Complimentary owner and staff bookings are never charged an automatic attendance fee.

Specialty event cancellations made more than 6 hours before the event receive one event-only booking credit that may be used for an eligible event within 30 days. Event credits cannot be used for standard classes. Event cancellations made 6 hours or less before the event do not return an event credit.

WEATHER AND EMERGENCY CLOSURES
When Rhyze cancels for severe weather, unsafe conditions, utility failure, government restriction, instructor emergency, or another event outside reasonable control, Rhyze will restore the class credit or offer a fee-free transfer. A member who reasonably believes conditions are unsafe to travel may promptly request a weather exception; Rhyze may approve a fee-free transfer based on official alerts, road conditions, timing, location, and the circumstances. A general State of Emergency does not always prohibit travel. Rhyze may cancel, delay, relocate, shorten, substitute an instructor, or move a class online. Updates may be sent by email, enabled SMS, website, or member portal.

REFUNDS AND MEMBERSHIP CANCELLATION
Classes, events, and workshops are non-refundable except where required by law or expressly approved. Special events, collaboration classes, and workshops are non-refundable; eligible cancellations receive the event-only credit described above instead of a cash refund. Statutory cancellation rights control over conflicting studio wording. Eligible New Jersey health-club contracts may include specific cancellation, relocation, disability, closure, and online termination rights in the membership agreement.

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
