import type { AnchorHTMLAttributes } from 'react';

export default function PreviewLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...props} onClick={(event) => {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('preview-action', { detail: 'Simulated navigation. No account or payment was opened.' }));
    }} />
  );
}
