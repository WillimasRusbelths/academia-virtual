import { useEffect, useRef, useState } from 'react';
import type { ApiFailure } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import type { AdminGroup, Slot, academicOfferingApi } from './api';
import { focusInvalid, OfferingReview, useOfferingCommand } from './offering-state';
import { scheduleErrors } from './validation';

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export function ScheduleEditor({ client, group, busy, onBusy, onSaved, onDenied, onReplace, onDirty, externalError }: {
  client: ReturnType<typeof academicOfferingApi>; group: AdminGroup; busy: boolean; onBusy: (value: boolean) => void;
  onSaved: (value: AdminGroup) => void; onDenied: (error: ApiFailure) => void; onReplace: (value: AdminGroup) => void;
  onDirty?: (dirty: boolean) => void; externalError?: string;
}) {
  const [slots, setSlots] = useState<readonly Slot[]>(group.schedule.map(value => ({ ...value })));
  const dirty = JSON.stringify(slots) !== JSON.stringify(group.schedule);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  const [invalid, setInvalid] = useState<string>(); const form = useRef<HTMLFormElement>(null); const command = useOfferingCommand<AdminGroup>();
  const editable = group.state === 'DRAFT' || group.state === 'WITHDRAWN'; const disabled = busy || command.pending || !editable;
  const error = invalid ?? externalError ?? (command.error?.fields.includes('schedule') ? 'Revisa las franjas y sus ocurrencias en el periodo.' : undefined);
  function change(index: number, values: Partial<Slot>) { command.changed(); setSlots(current => current.map((slot, offset) => offset === index ? { ...slot, ...values } : slot)); setInvalid(undefined); }
  async function save() {
    const errors = scheduleErrors(group.periodStart, group.periodEnd, slots); const invalid = errors.schedule ?? errors.periodStart ?? errors.periodEnd;
    setInvalid(invalid); if (invalid) { focusInvalid(form); return; }
    await command.run(JSON.stringify([group.id, group.revision, slots]), () => client.prepareSchedule(group.id, group.revision, slots),
      value => { setSlots(value.schedule.map(slot => ({ ...slot }))); onSaved(value); }, onDenied, onBusy);
    focusInvalid(form);
  }
  return <section aria-label="Horarios del grupo"><h2>Horario semanal</h2><p>America/Lima · Se valida contra las fechas guardadas del grupo. Guarda primero los cambios de periodo.</p>
    <form ref={form} noValidate aria-label="Editar horario" aria-busy={disabled} onSubmit={event => { event.preventDefault(); if (!disabled) void save(); }}>
      {slots.length === 0 && <p>Horario sin configurar.</p>}
      {slots.map((slot, index) => <fieldset key={index} disabled={disabled}><legend>Franja {index + 1}</legend>
        <div className="form-field"><label htmlFor={`slot-day-${index}`}>Día {index + 1}</label><select id={`slot-day-${index}`} value={slot.dayOfWeek}
          aria-invalid={error ? true : undefined} aria-describedby={error ? 'schedule-error' : undefined} onChange={event => change(index, { dayOfWeek: Number(event.target.value) })}>
          {days.map((label, day) => <option key={label} value={day + 1}>{label}</option>)}</select></div>
        <div className="offering-grid"><FormField id={`slot-start-${index}`} label={`Hora de inicio ${index + 1}`} type="time" value={slot.startTime}
          error={error ? 'Revisa esta franja.' : undefined} onChange={event => change(index, { startTime: event.target.value })}/>
          <FormField id={`slot-end-${index}`} label={`Hora de fin ${index + 1}`} type="time" value={slot.endTime}
            onChange={event => change(index, { endTime: event.target.value })}/></div>
        <button type="button" onClick={() => { command.changed(); setSlots(current => current.filter((_, offset) => offset !== index)); setInvalid(undefined); }}>Quitar franja {index + 1}</button>
      </fieldset>)}
      {error && <p id="schedule-error" className="field-error" role="alert">{error}</p>}
      <button type="button" disabled={disabled} aria-invalid={!slots.length && error ? true : undefined} aria-describedby={!slots.length && error ? 'schedule-error' : undefined} onClick={() => { command.changed(); setSlots(current => [...current, { dayOfWeek: 1, startTime: '', endTime: '' }]); setInvalid(undefined); }}>Añadir franja</button>
      <Feedback error={command.error} message={command.message} onRetry={() => void save()}/>
      <button type="submit" disabled={disabled}>{command.pending ? 'Guardando…' : 'Guardar horario'}</button>
      {command.error && [409, 503].includes(command.error.status) && <OfferingReview load={() => client.group(group.id)} replace={onReplace} denied={onDenied} disabled={disabled}/>}
    </form></section>;
}
