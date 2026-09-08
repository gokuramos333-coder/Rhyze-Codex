import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { priceEventOrder } from '@/lib/payments/commerce-orders';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { eventCheckoutWaiverDestination } from '@/lib/domain/waivers/acceptance';

const requestSchema = z.object({
  slug: z.string().min(1),
  childCount: z.number().int().min(1).max(5).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Sign in before purchasing an event ticket.' }, { status: 401 });
  }
  if (!stripeIsConfigured()) {
    return NextResponse.json({ error: 'Secure event checkout is not connected yet.' }, { status: 503 });
  }
  try {
    const { slug, childCount } = requestSchema.parse(await request.json());
    const occurrence = await prisma.classOccurrence.findFirst({
      where: {
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
    const priced = priceEventOrder({
      id: occurrence.id,
      slug: occurrence.template.slug,
      name: occurrence.template.name,
      isEvent: occurrence.template.isEvent,
      status: occurrence.status,
      startAt: occurrence.startAt,
      priceCents: occurrence.priceCents ?? occurrence.template.dropInPriceCents ?? 3_000,
      capacity: occurrence.capacity,
      booked: occurrence._count.bookings + occurrence.historicalSignupCount,
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
        purchaseType: 'EVENT',
        commerceOrderId: order.id,
        occurrenceId: occurrence.id,
        userId: user.id,
        customerName: user.name || '',
        customerEmail: user.email,
      },
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/book/event/${slug}`,
    }, { idempotencyKey: `event-checkout-${order.id}` });
    await prisma.commerceOrder.update({
      where: { id: order.id },
      data: { stripeCheckoutSessionId: checkout.id },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Event checkout could not be started.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
