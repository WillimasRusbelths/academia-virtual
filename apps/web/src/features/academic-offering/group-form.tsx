import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiFailure } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { Feedback } from '../../shared/ui/feedback';
import type { AdminGroup, GroupAttributes, academicOfferingApi } from './api';
import { focusInvalid, LoadingState, OfferingReview, useOfferingCommand, useOfferingResource } from './offering-state';
import { capacityError, nameError, scheduleErrors } from './validation';
import type { FieldErrors } from './validation';

function values(group?: AdminGroup) {
  return { name: group?.name ?? '', capacity: group?.capacity?.toString() ?? '', periodStart: group?.periodStart ?? '',
    periodEnd: group?.periodEnd ?? '', teacherUserId: group?.teacher?.id ?? '' };
}
export function GroupForm({ client, courseId, initial, busy = false, onBusy = () => undefined, onSaved, onCancel, onDenied, onReplace, onDirty, externalErrors = {} }: {
  client: ReturnType<typeof academicOfferingApi>; courseId: string; initial?: AdminGroup; busy?: boolean; onBusy?: (value: boolean) => void;
  onSaved: (value: AdminGroup) => void; onCancel: () => void; onDenied: (error: ApiFailure) => void; onReplace?: (value: AdminGroup) => void;
  onDirty?: (dirty: boolean) => void; externalErrors?: Readonly<Record<string, string>>;
}) {
  const [draft, setDraft] = useState(() => values(initial)); const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const dirty = JSON.stringify(draft) !== JSON.stringify(values(initial));
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  const [errors, setErrors] = useState<FieldErrors>({}); const form = useRef<HTMLFormElement>(null); const command = useOfferingCommand<AdminGroup>();
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState({ q: '', page: 1, pageSize: 20 });
  const [selectedTeacher, setSelectedTeacher] = useState(initial?.teacher ? { id: initial.teacher.id, name: initial.teacher.name } : undefined);
  const load = useCallback((signal: AbortSignal) => client.teachers(filter, signal), [client, filter]); const teachers = useOfferingResource(load);
  useEffect(() => { if (teachers.error && [401, 403].includes(teachers.error.status)) onDenied(teachers.error); }, [teachers.error, onDenied]);
  const editable = !initial || initial.state === 'DRAFT' || initial.state === 'WITHDRAWN'; const disabled = busy || command.pending || !editable;
  function change(key: keyof typeof draft, value: string) {
    command.changed(); setDraft(current => ({ ...current, [key]: value })); setTouched(current => new Set([...current, key])); setErrors({});
    if (key === 'teacherUserId') setSelectedTeacher(teachers.data?.items.find(teacher => teacher.id === value));
  }
  function searchTeachers() { setFilter({ ...filter, q: search.trim(), page: 1 }); }
  const error = (key: string) => errors[key] ?? externalErrors[key] ?? (command.error?.fields.includes(key as 'name') ? 'Revisa este campo.' : undefined);
  async function save() {
    const invalid: Record<string, string> = {}; const badName = nameError(draft.name); if (badName) invalid.name = badName;
    const configured = draft.capacity !== '' || initial?.capacity != null || touched.has('capacity');
    if (configured) { const bad = capacityError(draft.capacity); if (bad) invalid.capacity = bad; }
    for (const key of ['periodStart', 'periodEnd'] as const) {
      if (draft[key] === '' && (initial?.[key] != null || touched.has(key))) invalid[key] = 'Indica una fecha válida; no se elimina una fecha configurada con un valor vacío.';
    }
    const schedule = scheduleErrors(draft.periodStart || null, draft.periodEnd || null, initial?.schedule ?? []);
    Object.assign(invalid, schedule);
    if (schedule.schedule) { invalid.periodStart = schedule.schedule; delete invalid.schedule; }
    setErrors(invalid); if (Object.keys(invalid).length) { focusInvalid(form); return; }
    const attributes: GroupAttributes = { name: draft.name, timeZone: 'America/Lima',
      ...(configured ? { capacity: Number(draft.capacity) } : {}), ...(draft.periodStart ? { periodStart: draft.periodStart } : {}),
      ...(draft.periodEnd ? { periodEnd: draft.periodEnd } : {}),
      ...(draft.teacherUserId !== (initial?.teacher?.id ?? '') ? { teacherUserId: draft.teacherUserId || null } : {}) };
    await command.run(JSON.stringify([initial?.id, initial?.revision, courseId, attributes]),
      () => initial ? client.prepareGroupEdit(initial.id, initial.revision, attributes) : client.prepareGroup(courseId, attributes),
      value => { setDraft(values(value)); setTouched(new Set()); onSaved(value); }, onDenied, onBusy);
    focusInvalid(form);
  }
  return <form ref={form} noValidate aria-label={initial ? 'Editar grupo' : 'Crear grupo'} aria-busy={disabled}
    onSubmit={event => { event.preventDefault(); if (!disabled) void save(); }}>
    {!editable && <p>{initial?.state === 'CANCELLED' ? 'El grupo está cancelado. No permite cambios ni republicación.' : 'Retira la oferta antes de editar.'}</p>}
    <FormField id="group-name" label="Nombre" autoFocus={!initial} value={draft.name} error={error('name')} disabled={disabled} onChange={event => change('name', event.target.value)}/>
    <FormField id="group-capacity" label="Capacidad máxima" inputMode="decimal" value={draft.capacity} error={error('capacity')} disabled={disabled}
      placeholder="Sin configurar" onChange={event => change('capacity', event.target.value)}/>
    <p>Ocupación y disponibilidad no calculadas.</p>
    <div className="offering-grid"><FormField id="group-start" label="Fecha de inicio" type="date" value={draft.periodStart} error={error('periodStart')} disabled={disabled} onChange={event => change('periodStart', event.target.value)}/>
      <FormField id="group-end" label="Fecha de fin" type="date" value={draft.periodEnd} error={error('periodEnd')} disabled={disabled} onChange={event => change('periodEnd', event.target.value)}/></div>
    <p>Zona horaria: America/Lima. Fechas extremas incluidas. Los datos omitidos del borrador quedan sin configurar.</p>
    <fieldset disabled={disabled}><legend>Asignación docente</legend>
      <p>Asignar un docente no crea cuentas ni cambia sus permisos.</p>
      <FormField id="teacher-search" label="Buscar docente por nombre" value={search} disabled={teachers.loading} onChange={event => setSearch(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); searchTeachers(); } }}/>
      <button type="button" disabled={teachers.loading} onClick={searchTeachers}>Buscar docente</button>
      <LoadingState loading={teachers.loading} error={teachers.error} retry={teachers.reload}/>
      <label htmlFor="group-teacher">Docente asignado</label><select id="group-teacher" value={draft.teacherUserId}
        disabled={teachers.loading || !!teachers.error} aria-invalid={error('teacherUserId') ? true : undefined}
        aria-describedby={error('teacherUserId') ? 'group-teacher-error' : undefined} onChange={event => change('teacherUserId', event.target.value)}>
        <option value="">Sin docente asignado</option>
        {selectedTeacher && !teachers.data?.items.some(value => value.id === selectedTeacher.id) &&
          <option value={selectedTeacher.id} disabled={initial?.teacher?.id === selectedTeacher.id && !initial.teacher.eligible}>{selectedTeacher.name} · Selección actual</option>}
        {teachers.data?.items.map(value => <option key={value.id} value={value.id}>{value.name} · {value.id}</option>)}
      </select>{error('teacherUserId') && <p id="group-teacher-error" className="field-error">{error('teacherUserId')}</p>}
      {teachers.data && <><p>{teachers.data.total ? 'Solo se muestran docentes habilitados.' : 'No hay docentes habilitados que coincidan.'}</p>
        <button type="button" disabled={filter.page <= 1 || teachers.loading} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Docentes anteriores</button>
        <button type="button" disabled={filter.page * filter.pageSize >= teachers.data.total || teachers.loading} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Más docentes</button></>}
    </fieldset>
    <Feedback error={command.error} message={command.message} onRetry={() => void save()}/>
    <button type="submit" disabled={disabled}>{command.pending ? 'Guardando…' : 'Guardar grupo'}</button><button type="button" disabled={busy || command.pending} onClick={onCancel}>Cancelar</button>
    {initial && command.error && [409, 503].includes(command.error.status) && onReplace && <OfferingReview load={() => client.group(initial.id)} replace={onReplace} denied={onDenied} disabled={disabled}/>}
  </form>;
}
