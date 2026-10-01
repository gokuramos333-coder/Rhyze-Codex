'use server';
import { redirect } from 'next/navigation';
import { requireApprovedOwner } from '@/lib/auth/session';
// Old forms cannot bypass the new consent, preview and explicit approval workflow.
export async function createCampaignAction(){ await requireApprovedOwner(); redirect('/admin/newsletters'); }
export async function queueCampaignAction(){ await requireApprovedOwner(); redirect('/admin/newsletters'); }
