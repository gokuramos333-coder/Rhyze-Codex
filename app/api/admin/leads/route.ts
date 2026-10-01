import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { newsletterActor } from '@/lib/newsletters/access';
import {
  loadCustomers,
  captureEnabled,
  logOutreach,
  staff,
  timeline,
} from '@/lib/newsletters/repository';
import { outcomes } from '@/lib/newsletters/domain';
export async function GET(request: Request) {
  const actor = await newsletterActor(true);
  if (!actor)
    return NextResponse.json(
      { error: 'Staff access required' },
      { status: 403 },
    );
  const u = new URL(request.url);
  const userId = u.searchParams.get('userId');
  return NextResponse.json(
    userId
      ? { timeline: await timeline(userId) }
      : {
          capture: captureEnabled(),
          customers: await loadCustomers(
            Math.min(
              365,
              Math.max(1, Number(u.searchParams.get('days')) || 30),
            ),
          ),
          staff: await staff(),
          actor: { id: actor.id, name: actor.name },
          newsletterAccess: actor.role !== 'MANAGER',
        },
  );
}
const schema = z
  .object({
    userId: z.string().min(1),
    version: z.number().int().nonnegative(),
    operationKey: z.string().uuid(),
    type: z.enum(['OUTREACH', 'STATUS', 'NOTE']),
    method: z.enum(['CALL', 'TEXT']).optional(),
    outcome: z.enum(outcomes).optional(),
    note: z.string().max(4000).optional(),
    followUpAt: z.string().datetime({ offset: true }).nullable().optional(),
    assignedToId: z.string().nullable().optional(),
  })
  .refine(
    (x) => x.type !== 'OUTREACH' || !!x.method,
    'Choose a contact method.',
  )
  .refine((x) => x.type !== 'NOTE' || !!x.note?.trim(), 'Add a note.');
export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request))
    return NextResponse.json(
      { error: 'Same-origin request required' },
      { status: 403 },
    );
  const actor = await newsletterActor(true);
  if (!actor)
    return NextResponse.json(
      { error: 'Staff access required' },
      { status: 403 },
    );
  try {
    const input = schema.parse(await request.json());
    return NextResponse.json({ entry: await logOutreach(actor, input) });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? 'Check required fields.'
            : e instanceof Error
              ? e.message
              : 'Unable to save outreach.',
      },
      { status: 409 },
    );
  }
}
