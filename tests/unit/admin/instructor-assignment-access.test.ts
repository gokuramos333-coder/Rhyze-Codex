import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { canAccessArea } from '@/lib/auth/authorization';
import { assignableInstructorWhere } from '@/lib/admin/assignable-instructors';
const findFirst = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/prisma', () => ({ prisma: { user: { findFirst } } }));
import { requireAssignableInstructor } from '@/lib/domain/instructors/assignment';

describe('accessible instructor assignments', () => {
  beforeEach(() => findFirst.mockReset());
  it.each(['OWNER', 'ADMIN', 'MANAGER', 'INSTRUCTOR'] as const)('allows %s into instructor operational views', role => {
    expect(canAccessArea(role, 'instructor')).toBe(true);
  });
  it('does not give members instructor access or instructors admin access', () => {
    expect(canAccessArea('MEMBER', 'instructor')).toBe(false);
    expect(canAccessArea('INSTRUCTOR', 'admin')).toBe(false);
  });
  it('only offers active login-capable non-placeholder staff', () => {
    expect(assignableInstructorWhere).toMatchObject({
      status: 'ACTIVE', role: { in: ['INSTRUCTOR', 'OWNER', 'ADMIN', 'MANAGER'] },
      passwordHash: { not: null }, NOT: { email: { endsWith: '@rhyze.local', mode: 'insensitive' } },
    });
  });
  it.each([null, '', '  '])('rejects missing instructor %s before querying', async id => {
    await expect(requireAssignableInstructor(id)).rejects.toThrow('Choose an active instructor account');
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('rejects an account not returned by the access policy', async () => {
    findFirst.mockResolvedValue(null);
    await expect(requireAssignableInstructor('inactive')).rejects.toThrow('Choose an active instructor account');
    expect(findFirst).toHaveBeenCalledWith({where:{id:'inactive',...assignableInstructorWhere},select:{id:true}});
  });
  it('accepts the exact eligible account id', async () => {
    findFirst.mockResolvedValue({id:'avery'});
    await expect(requireAssignableInstructor('avery')).resolves.toBe('avery');
  });
  it('guards creation, recurrence, updates and duplication before writes', () => {
    const classes = readFileSync('app/(studio)/admin/classes/actions.ts','utf8');
    for (const name of ['createClassTemplateAction','createOccurrenceAction','createRecurringOccurrencesAction']) {
      const body=classes.split(`export async function ${name}`)[1].split('export async function')[0];
      expect(body).toContain('requireAssignableInstructor(instructorId)');
    }
    const actions = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/actions.ts','utf8');
    expect(actions.split('export async function updateOccurrenceAction')[1].split('export async function')[0]).toContain('requireAssignableInstructor(instructorId)');
    expect(actions.split('export async function duplicateOccurrenceAction')[1].split('export async function')[0]).toContain('requireAssignableInstructor(item.instructorId)');
  });
  it('guards bulk template reassignment and requires instructor selectors', () => {
    const bulk=readFileSync('app/(studio)/admin/classes/[templateId]/actions.ts','utf8').split('export async function assignTemplateInstructorAction')[1];
    expect(bulk).toContain('requireAssignableInstructor(instructorId)');
    expect(bulk).toContain('startAt: { gte: new Date() }');
    const schedule=readFileSync('app/(studio)/admin/schedule/page.tsx','utf8');
    expect(schedule).toContain('<select name={name} required');
    expect(schedule).toContain('Choose an active instructor account');
  });
  it('retains exact occurrence ownership checks on instructor management', () => {
    const roster=readFileSync('app/(portal)/instructor/classes/[occurrenceId]/roster/actions.ts','utf8');
    expect(roster).toContain("actor.role === 'INSTRUCTOR' && occurrence.instructorId !== actor.id");
    const schedule=readFileSync('app/(portal)/instructor/schedule/page.tsx','utf8');
    expect(schedule).toContain('instructorId: user.id');
  });
});
