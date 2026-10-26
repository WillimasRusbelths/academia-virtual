import { useCallback, useMemo, useState } from 'react';
import type { ApiClient } from '../../shared/api-client';
import { academicOfferingApi } from './api';
import { GroupForm } from './group-form';
import { ScheduleEditor } from './schedule-editor';
import { PublicationAction } from './publication-action';
import { MaintenanceAction } from './maintenance-action';
import { LoadingState, OfferingLayout, stateLabels, useOfferingResource } from './offering-state';

export function AdminGroupPage({ api, id, navigate }: { api: ApiClient; id: string; navigate: (path: string) => void }) {
  const client = useMemo(() => academicOfferingApi(api), [api]); const load = useCallback((signal: AbortSignal) => client.group(id, signal), [client, id]);
  const resource = useOfferingResource(load); const [busy, setBusy] = useState(false); const [formVersion, setFormVersion] = useState(0);
  const [dirtyGroup, setDirtyGroup] = useState(false); const [dirtySchedule, setDirtySchedule] = useState(false);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  return <OfferingLayout title="Preparar grupo"><LoadingState loading={resource.loading} error={resource.error} retry={resource.reload}/>
    {resource.data && <><p><a href={`/admin/oferta/cursos/${resource.data.courseId}`}>Volver al curso</a></p>
      <p>{stateLabels[resource.data.state]} · {resource.data.studentVisible ? 'Visible para alumnos' : 'No visible para alumnos'}</p>
      <p>Capacidad máxima: {resource.data.capacity === null ? 'Sin configurar' : `${resource.data.capacity} alumnos`}. Ocupación y disponibilidad no calculadas.</p>
      {resource.data.state === 'CANCELLED' && <section aria-label="Cancelación del grupo"><h2>Grupo cancelado</h2>
        <p>{resource.data.cancellationReason}</p><p>Cancelación confirmada: {resource.data.cancelledAt}</p></section>}
      {resource.data.teacher && !resource.data.teacher.eligible && <p>Docente no habilitado: {resource.data.teacher.name}</p>}
      {resource.data.teacherReviewRequired && <p>Revisión docente requerida. Recuperar habilitación no republica el grupo.</p>}
      {resource.data.lastPublishedTeacherId && <p>Docente de la última publicación: <a href={`/admin/cuentas/${resource.data.lastPublishedTeacherId}`}>Consultar cuenta de referencia</a></p>}
      <GroupForm key={`group-${formVersion}`} client={client} courseId={resource.data.courseId} initial={resource.data} busy={busy} onBusy={setBusy}
        onDirty={setDirtyGroup} externalErrors={errors} onSaved={value => { resource.accept(value); setErrors({}); }} onCancel={() => navigate(`/admin/oferta/cursos/${resource.data!.courseId}`)} onDenied={resource.denied}
        onReplace={value => { resource.accept(value); setFormVersion(value => value + 1); }}/>
      <ScheduleEditor key={`schedule-${formVersion}`} client={client} group={resource.data} busy={busy} onBusy={setBusy}
        onDirty={setDirtySchedule} externalError={errors.schedule} onSaved={value => { resource.accept(value); setErrors({}); }}
        onDenied={resource.denied} onReplace={value => { resource.accept(value); setFormVersion(value => value + 1); }}/>
      <PublicationAction value={resource.data} dirty={dirtyGroup || dirtySchedule} busy={busy} onBusy={setBusy} onInvalid={setErrors}
        prepare={() => client.prepareGroupPublication(id, resource.data!.revision)} onSaved={resource.accept} onDenied={resource.denied}
        load={() => client.group(id)} onReplace={value => { resource.accept(value); setFormVersion(version => version + 1); setErrors({}); }}/>
      <MaintenanceAction value={resource.data} dirty={dirtyGroup || dirtySchedule} busy={busy} onBusy={setBusy}
        withdraw={() => client.prepareGroupWithdrawal(id, resource.data!.revision)}
        cancel={reason => client.prepareGroupCancellation(id, resource.data!.revision, reason)} onDenied={resource.denied} load={() => client.group(id)}
        onSaved={value => { resource.accept(value); setFormVersion(version => version + 1); setDirtyGroup(false); setDirtySchedule(false); setErrors({}); }}
        onReplace={value => { resource.accept(value); setFormVersion(version => version + 1); setDirtyGroup(false); setDirtySchedule(false); setErrors({}); }}/>
    </>}
  </OfferingLayout>;
}
