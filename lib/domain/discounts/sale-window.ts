// Wall-clock arithmetic only. Server validation resolves the result in New Jersey
// and rejects impossible/ambiguous DST times before saving a financial offer.
export function saleWindowEnd(start:string,count:number,unit:string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) || !Number.isInteger(count) || count < 1 || count > 600 || !['hours','days','weeks','months'].includes(unit)) return '';
  const date=new Date(`${start}:00Z`);
  if (!Number.isFinite(date.getTime())) return '';
  if (unit==='months') {
    const day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+count);
    const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));
  } else if (unit==='hours') date.setUTCHours(date.getUTCHours()+count);
  else date.setUTCDate(date.getUTCDate()+count*(unit==='weeks'?7:1));
  return date.toISOString().slice(0,16);
}
