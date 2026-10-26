import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiFailure } from '../../shared/api-client';
import { Feedback } from '../../shared/ui/feedback';
import type { AdminCourse, AdminGroup, PreparedCommand } from './api';
import { OfferingReview, useOfferingCommand, weekDays } from './offering-state';

/** Solo identifica datos guardados ausentes; el servidor revalida reglas y concurrencia. */
export function publicationMissing(value: AdminCourse | AdminGroup): Readonly<Record<string, string>> {
  if ('description' in value) return value.description ? {} : { description: 'Completa y guarda la descripción antes de publicar.' };
  const errors: Record<string, string> = {};
  if (value.capacity === null) errors.capacity = 'Configura y guarda la capacidad máxima (1–50).';
  if (!value.periodStart) errors.periodStart = 'Configura y guarda la fecha de inicio.';
  if (!value.periodEnd) errors.periodEnd = 'Configura y guarda la fecha de fin.';
  if (!value.teacher || !value.teacher.eligible) errors.teacherUserId = 'Asigna y guarda un docente habilitado.';
  if (!value.schedule.length) errors.schedule = 'Configura y guarda al menos una franja semanal.';
  return errors;
}
function Confirmation({ children, pending, cancel, confirm }: { children: ReactNode; pending: boolean; cancel: () => void; confirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => { if (element.open) element.close(); }; }, []);
  return <dialog ref={dialog} aria-labelledby="publication-title" aria-busy={pending} onCancel={event => { event.preventDefault(); if (!pending) cancel(); }}>
    <h2 id="publication-title">Confirmar publicación</h2>{children}
    <button type="button" autoFocus disabled={pending} onClick={cancel}>Cancelar</button>
    <button type="button" disabled={pending} onClick={confirm}>{pending ? 'Publicando…' : 'Confirmar publicación'}</button>
  </dialog>;
}
export function PublicationAction<T extends AdminCourse | AdminGroup>({ value, dirty, busy, onBusy, prepare, onSaved, onDenied, load, onReplace, onInvalid }: {
  value: T; dirty: boolean; busy: boolean; onBusy: (value: boolean) => void; prepare: () => PreparedCommand<T>;
  onSaved: (value: T) => void; onDenied: (error: ApiFailure) => void; load: () => Promise<T>; onReplace: (value: T) => void;
  onInvalid: (errors: Readonly<Record<string, string>>) => void;
}) {
  const [open, setOpen] = useState(false); const [incomplete, setIncomplete] = useState(false);
  const command = useOfferingCommand<T>(); const trigger = useRef<HTMLButtonElement>(null);
  const group: AdminGroup | undefined = 'schedule' in value ? value as AdminGroup : undefined;
  const editable = value.state === 'DRAFT' || value.state === 'WITHDRAWN';
  const close = () => { setOpen(false); onBusy(false); requestAnimationFrame(() => trigger.current?.focus()); };
  const confirm = () => {
    void command.run(JSON.stringify([value.id, value.revision, 'publish']), prepare, result => {
      setOpen(false); onSaved(result); requestAnimationFrame(() => trigger.current?.focus());
    }, onDenied, onBusy);
  };
  return <section aria-label="Publicación"><h2>Publicación</h2>
    <p>Publicar requiere confirmación. Publicado y visible para alumnos son comprobaciones distintas.</p>
    <p>Se publica únicamente la versión guardada. Guardar no publica ni reserva cupos.</p>
    {dirty && <p>Guarda o descarta las ediciones antes de publicar.</p>}
    <button ref={trigger} type="button" disabled={busy || command.pending || dirty || !editable} onClick={() => {
      const missing = publicationMissing(value); onInvalid(missing); setIncomplete(Object.keys(missing).length > 0);
      if (Object.keys(missing).length) { requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
      setOpen(true); onBusy(true);
    }}>Publicar {group ? 'grupo' : 'curso'}</button>
    {incomplete && <p role="alert">Completa los campos y el horario indicados antes de publicar.</p>}
    {!open && <Feedback error={command.error} message={command.message ? 'Publicación confirmada por el servidor. Comprueba la visibilidad indicada.' : undefined}/>}
    {open && <Confirmation pending={command.pending} cancel={close} confirm={confirm}>
      <p>{value.name}</p>{group ? <>
        <p>Docente: {group.teacher?.name}</p><p>{group.periodStart} — {group.periodEnd} · America/Lima</p>
        <p>Capacidad máxima: {group.capacity} alumnos</p><p>Ocupación y disponibilidad no calculadas</p>
        <ul>{group.schedule.map((slot, index) => <li key={index}>{weekDays[slot.dayOfWeek - 1]}: {slot.startTime}–{slot.endTime}</li>)}</ul>
        {group.teacherReviewRequired && <p>La habilitación recuperada requiere revisión y esta publicación explícita.</p>}
      </> : <><p>{(value as AdminCourse).description}</p><p>Publicar el curso no publica sus grupos. Solo será visible cuando tenga grupos visibles.</p></>}
      <Feedback error={command.error}/>
      {command.error?.status === 503 && <p>Confirmar de nuevo repite la misma intención.</p>}
      {!!command.error?.conflictingGroupIds.length && <ul aria-label="Grupos que requieren revisión">{command.error.conflictingGroupIds.map(id =>
        <li key={id}><a href={`/admin/oferta/grupos/${id}`}>Revisar grupo {id}</a></li>)}</ul>}
      {command.error && [409, 503].includes(command.error.status) && <OfferingReview load={load} denied={onDenied} disabled={command.pending}
        replace={saved => { close(); onReplace(saved); }}/>}
    </Confirmation>}
  </section>;
}
