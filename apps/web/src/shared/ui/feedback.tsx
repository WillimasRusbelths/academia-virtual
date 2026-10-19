import type { ApiFailure } from '../api-client';
export function Feedback({error,message,onRetry}: {readonly error?:ApiFailure;readonly message?:string;readonly onRetry?:()=>void}) {
  if (!error && !message) return null;
  return <div className="feedback" role={error?'alert':'status'} aria-atomic="true">
    <p>{error?.message??message}</p>
    {error?.retryAfterSeconds!==undefined && <p>Espera {error.retryAfterSeconds} segundos antes de intentarlo de nuevo.</p>}
    {error?.status===503 && onRetry && <button type="button" onClick={onRetry}>Reintentar</button>}
  </div>;
}
