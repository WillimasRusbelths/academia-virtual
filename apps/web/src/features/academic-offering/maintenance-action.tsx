import { useId, useRef, useState } from 'react';
import type { ApiFailure } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import type { AdminCourse, AdminGroup, PreparedCommand } from './api';
import { focusInvalid, OfferingConfirmation, OfferingReview, useOfferingCommand } from './offering-state';

/** Transiciones explícitas sobre la revisión guardada; backend conserva la autoridad. */
export function MaintenanceAction<T extends AdminCourse | AdminGroup>({ value, dirty, busy, onBusy, withdraw, cancel, onSaved, onDenied, load, onReplace }: {
  value: T; dirty: boolean; busy: boolean; onBusy: (value: boolean) => void;
  withdraw: () => PreparedCommand<T>; cancel?: (reason: string) => PreparedCommand<T>;
  onSaved: (value: T) => void; onDenied: (error: ApiFailure) => void; load: () => Promise<T>; onReplace: (value: T) => void;
}) {
  const [action, setAction] = useState<'withdraw' | 'cancel'>(), [reason, setReason] = useState(''), [invalid, setInvalid] = useState<string>();
  const command = useOfferingCommand<T>(), trigger = useRef<HTMLButtonElement | null>(null), form = useRef<HTMLFormElement>(null), reasonId = useId();
  const group = 'schedule' in value;
  function close() { setAction(undefined); onBusy(false); requestAnimationFrame(() => trigger.current?.focus()); }
  function open(next: 'withdraw' | 'cancel', button: HTMLButtonElement) { trigger.current = button; setInvalid(undefined); setAction(next); onBusy(true); }
  function confirm() {
    if (!action) return;
    if (action === 'cancel' && !reason.trim()) { setInvalid('Indica el motivo de cancelación.'); focusInvalid(form); return; }
    const key = JSON.stringify([value.id, value.revision, action, action === 'cancel' ? reason.trim() : null]);
    void command.run(key, () => action === 'cancel' ? cancel!(reason.trim()) : withdraw(), result => {
      setAction(undefined); setInvalid(undefined); onSaved(result);
    }, onDenied, onBusy);
  }
  return <section aria-label="Mantenimiento de oferta"><h2>{group ? 'Retiro y cancelación' : 'Retiro del curso'}</h2>
    <p>{group ? 'Retirar el grupo permite corregirlo. Guardar cambios no lo republica.'
      : 'Retirar el curso oculta sus grupos al alumno. Sus grupos publicados conservan estado y programación; deben retirarse individualmente para editarlos.'}</p>
    {dirty && <p>Guarda o descarta las ediciones antes de retirar o cancelar.</p>}
    <button type="button" disabled={busy || command.pending || dirty || value.state !== 'PUBLISHED'} onClick={event => open('withdraw', event.currentTarget)}>
      Retirar {group ? 'grupo' : 'curso'}</button>
    {cancel && <button type="button" disabled={busy || command.pending || dirty || value.state === 'CANCELLED'} onClick={event => open('cancel', event.currentTarget)}>Cancelar grupo</button>}
    {!action && <Feedback error={command.error} message={command.message ? 'Cambio de estado confirmado por el servidor.' : undefined}/>}
    {action && <OfferingConfirmation title={action === 'cancel' ? 'Confirmar cancelación' : 'Confirmar retiro'} pending={command.pending} cancel={close} confirm={confirm}>
      <p>{value.name}</p>
      {action === 'cancel' ? <><p>La cancelación del grupo es definitiva: conserva sus datos y no permite editarlo ni republicarlo.</p>
        <form ref={form} noValidate onSubmit={event => { event.preventDefault(); if (!command.pending) confirm(); }}>
          <FormField id={reasonId} label="Motivo de cancelación" value={reason} disabled={command.pending}
            error={invalid ?? (command.error?.fields.includes('cancellationReason') ? 'Revisa el motivo de cancelación.' : undefined)}
            onChange={event => { setReason(event.target.value); setInvalid(undefined); command.changed(); }}/>
        </form></> : <p>{group ? 'El grupo dejará de ofrecerse y podrá editarse. Su publicación posterior requiere otra confirmación.'
          : 'El curso y sus grupos dejarán de ofrecerse al alumno. No cambia el estado ni se libera la programación de sus grupos publicados.'}</p>}
      <Feedback error={command.error}/>
      {command.error?.status === 503 && <p>El resultado es incierto. Comprueba el estado o confirma de nuevo para repetir la misma intención. Salir no deshace un comando que pueda haberse aplicado.</p>}
      {command.error && [409, 503].includes(command.error.status) && <OfferingReview load={load} denied={onDenied} disabled={command.pending}
        replace={saved => { command.discard(); close(); onReplace(saved); }}/>}
    </OfferingConfirmation>}
  </section>;
}
