import { specialEventIdentity, specialEventOfferMatches } from '@/lib/payments/black-friday-new-friend';
import { blackFridaySalesEnabled } from '@/lib/payments/black-friday-release-gate';
import { startBlackFridayCheckout } from '@/lib/payments/black-friday-checkout';
import { buildCheckoutWalletParameters } from '@/lib/payments/checkout-config';
import { NextResponse } from 'next/server';
import { attributionMetadata } from '@/lib/attribution/first-touch';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { priceEventOrder } from '@/lib/payments/commerce-orders';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { eventCheckoutWaiverDestination } from '@/lib/domain/waivers/acceptance';

const requestSchema = z.object({
  slug: z.string().min(1),
  occurrenceId: z.string().min(1).optional(),
  childCount: z.number().int().min(1).max(5).optional(),
  ticketType: z.enum(['SINGLE','PAIR']).optional(),
  friend: z.object({ fullName: z.string().min(3).max(120), phone: z.string().min(10).max(30) }).strict().optional(),
  firstVisitDeclared: z.boolean().optional(),
  useEventCredit: z.boolean().optional(),
}).strict();

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in before purchasing an event ticket.' }, { status: 401 });
  }
  if (!stripeIsConfigured()) {
    return NextResponse.json({ error: 'Secure event checkout is not connected yet.' }, { status: 503 });
  }
  try {
    const input = requestSchema.parse(await request.json());
    const { slug, occurrenceId, childCount } = input;
    const occurrence = await prisma.classOccurrence.findFirst({
      where: {
        ...(occurrenceId ? { id: occurrenceId } : {}),
        template: { slug, isEvent: true, isActive: true },
        status: 'SCHEDULED',
        startAt: { gt: new Date() },
      },
      orderBy: { startAt: 'asc' },
      include: {
        template: true,
        _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
      },
    });
    if (!occurrence) {
      return NextResponse.json({ error: 'No upcoming event date is available.' }, { status: 404 });
    }
    const specialOffer = specialEventIdentity(occurrence.id);
    if (specialOffer) {
      if (!blackFridaySalesEnabled()) return NextResponse.json({error:'Special ticket sales are not open yet.'},{status:503});
      if (!specialEventOfferMatches(occurrence)) throw new Error('Wrong event occurrence');
      if (childCount !== undefined) throw new Error('Child pricing does not apply to this event.');
      return NextResponse.json(await startBlackFridayCheckout(prisma, getStripe(), { ...input, occurrenceId: specialOffer.occurrenceId, ticketType: input.ticketType ?? 'SINGLE', userId: session.user.id, origin: new URL(request.url).origin }));
    }
    if (input.ticketType || input.friend || input.firstVisitDeclared !== undefined || input.useEventCredit !== undefined) throw new Error('This ticket option is not available for this event.');
    const priced = priceEventOrder({
      id: occurrence.id,
      slug: occurrence.template.slug,
      name: occurrence.template.name,
      isEvent: occurrence.template.isEvent,
      status: occurrence.status,
      startAt: occurrence.startAt,
      priceCents: occurrence.priceCents ?? occurrence.template.dropInPriceCents ?? 3_000,
      capacity: occurrence.capacity,
      booked: occurrence._count.bookings + occurrence.historicalSignupCount + (occurrence.pendingTicketSeats ?? 0),
    }, new Date(), { childCount });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
    const activeWaiver = await prisma.waiverVersion.findFirst({
      where: { isActive: true, requiresSign: true },
      select: { id: true },
      orderBy: { effectiveAt: 'desc' },
    });
    const waiverAcceptance = activeWaiver
      ? await prisma.waiverAcceptance.findUnique({
          where: {
            waiverVersionId_userId: {
              waiverVersionId: activeWaiver.id,
              userId: user.id,
            },
          },
          select: { id: true },
        })
      : null;
    if (!activeWaiver || !waiverAcceptance) {
      return NextResponse.json(
        {
          error: 'Review and accept the studio waiver before purchasing an event ticket.',
          waiverUrl: eventCheckoutWaiverDestination(slug),
        },
        { status: 403 },
      );
    }
    const existingBooking = await prisma.booking.findUnique({
      where: { occurrenceId_userId: { occurrenceId: occurrence.id, userId: user.id } },
      select: { status: true },
    });
    if (existingBooking?.status === 'CONFIRMED' || existingBooking?.status === 'ATTENDED') {
      return NextResponse.json({ error: 'You are already booked for this event.' }, { status: 409 });
    }
    const order = await prisma.commerceOrder.create({
      data: {
        userId: user.id,
        occurrenceId: occurrence.id,
        kind: 'EVENT',
        amountCents: priced.amountCents,
        customerName: user.name,
        customerEmail: user.email,
        items: { create: priced.item },
      },
    });
    const origin = new URL(request.url).origin;
    const checkout = await getStripe().checkout.sessions.create({
      mode: 'payment',
      ...buildCheckoutWalletParameters(),
      ...(user.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : { customer_creation: 'always' as const, customer_email: user.email }),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: priced.amountCents,
          product_data: { name: priced.item.name, description: priced.item.description },
        },
      }],
      billing_address_collection: 'required',
      payment_intent_data: {
        metadata: {
          purchaseType: 'EVENT',
          commerceOrderId: order.id,
          occurrenceId: occurrence.id,
          userId: user.id,
          customerName: user.name || '',
          customerEmail: user.email,
        },
      },
      client_reference_id: order.id,
      metadata: {
        ...attributionMetadata(user),
        purchaseType: 'EVENT',
        commerceOrderId: order.id,
        occurrenceId: occurrence.id,
        userId: user.id,
        customerName: user.name || '',
        customerEmail: user.email,
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/book/event/${slug}?occurrence=${encodeURIComponent(occurrence.id)}`,
    }, { idempotencyKey: `event-checkout-${order.id}` });
    await prisma.commerceOrder.update({
      where: { id: order.id },
      data: { stripeCheckoutSessionId: checkout.id },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? 'Please check your ticket details and try again.'
      : 'We couldn’t start checkout. Please check your bookings or contact the studio for help.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
