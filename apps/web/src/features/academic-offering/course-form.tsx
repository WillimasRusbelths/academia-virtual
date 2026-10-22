import { useRef, useState } from 'react';
import type { ApiFailure } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import type { AdminCourse, academicOfferingApi } from './api';
import { focusInvalid, OfferingReview, useOfferingCommand } from './offering-state';
import { nameError } from './validation';

export function CourseForm({ client, initial, onSaved, onCancel, onDenied, onReplace }: {
  client: ReturnType<typeof academicOfferingApi>; initial?: AdminCourse; onSaved: (value: AdminCourse) => void;
  onCancel: () => void; onDenied: (error: ApiFailure) => void; onReplace?: (value: AdminCourse) => void;
}) {
  const [name, setName] = useState(initial?.name ?? ''); const [description, setDescription] = useState(initial?.description ?? '');
  const [invalid, setInvalid] = useState<string>(); const command = useOfferingCommand<AdminCourse>(); const form = useRef<HTMLFormElement>(null);
  const editable = !initial || initial.state === 'DRAFT' || initial.state === 'WITHDRAWN';
  const serverName = command.error?.fields.includes('name') ? 'Revisa el nombre.' : undefined;
  async function save() {
    const error = nameError(name); setInvalid(error); if (error) { focusInvalid(form); return; }
    const values = { name, description }; const key = JSON.stringify([initial?.id, initial?.revision, values]);
    await command.run(key, () => initial ? client.prepareCourseEdit(initial.id, initial.revision, values) : client.prepareCourse(values),
      value => { setName(value.name); setDescription(value.description ?? ''); onSaved(value); }, onDenied);
    focusInvalid(form);
  }
  return <form ref={form} noValidate aria-label={initial ? 'Editar curso' : 'Crear curso'} aria-busy={command.pending}
    onSubmit={event => { event.preventDefault(); if (editable) void save(); }}>
    {!editable && <p>Retira la oferta antes de editar.</p>}
    <FormField id="course-name" label="Nombre" autoFocus={!initial} value={name} error={invalid ?? serverName}
      disabled={command.pending || !editable} onChange={event => { command.changed(); setName(event.target.value); setInvalid(undefined); }}/>
    <div className="form-field"><label htmlFor="course-description">Descripción</label>
      <textarea id="course-description" rows={4} value={description} disabled={command.pending || !editable}
        aria-invalid={command.error?.fields.includes('description') ? true : undefined}
        aria-describedby={command.error?.fields.includes('description') ? 'course-description-error' : undefined}
        onChange={event => { command.changed(); setDescription(event.target.value); }}/>
      {command.error?.fields.includes('description') && <p id="course-description-error" className="field-error">Revisa la descripción.</p>}</div>
    <Feedback error={command.error} message={command.message} onRetry={() => void save()}/>
    <button type="submit" disabled={command.pending || !editable}>{command.pending ? 'Guardando…' : 'Guardar curso'}</button>
    <button type="button" disabled={command.pending} onClick={onCancel}>Cancelar</button>
    {initial && command.error && [409, 503].includes(command.error.status) && onReplace &&
      <OfferingReview load={() => client.course(initial.id)} replace={onReplace} denied={onDenied} disabled={command.pending}/>}
  </form>;
}
