'use client';
import { useActionState } from 'react';
import type { DiscountAction } from './DiscountCampaignForm';
export function DiscountCampaignToggle({id, enabled, action}:{id:string;enabled:boolean;action:DiscountAction}) {
 const [result, submit, pending] = useActionState(async (_previous:{error:string}|null, data:FormData) => (await action(data)) || null, null);
 return <form action={submit}><input type="hidden" name="id" value={id}/><input type="hidden" name="enabled" value={String(!enabled)}/>{result?.error && <p role="alert">{result.error}</p>}<button disabled={pending} className="border px-4 py-2">{pending ? 'Updating…' : enabled ? 'Disable new checkouts' : 'Enable code'}</button></form>;
}
