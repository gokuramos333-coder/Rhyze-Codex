import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { getProduct } from '@/lib/products';

const checkoutSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        size: z.string().min(1),
        qty: z.number().int().min(1).max(10),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  if (!stripeIsConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'checkout_not_configured',
        message:
          'Secure online checkout is not connected yet. Contact Rhyze to reserve your gear.',
      },
      { status: 503 },
    );
  }

  try {
    const { items } = checkoutSchema.parse(await request.json());
    const lineItems = items.map((item) => {
      const product = getProduct(item.productId);
      if (
        !product ||
        product.comingSoon ||
        !product.sizes.includes(item.size)
      ) {
        throw new Error('invalid_product');
      }
      return {
        quantity: item.qty,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(product.price * 100),
          product_data: {
            name: `${product.name} — ${item.size}`,
            description: product.description,
          },
        },
      };
    });

    const origin = new URL(request.url).origin;
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata: { purchaseType: 'MERCHANDISE' },
    });

    if (!session.url) throw new Error('missing_checkout_url');
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      (error instanceof Error && error.message === 'invalid_product')
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_cart',
          message:
            'Your cart contains an unavailable item. Please update it and try again.',
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: 'checkout_failed',
        message:
          'Checkout could not be started. Please try again or contact Rhyze.',
      },
      { status: 502 },
    );
  }
}
