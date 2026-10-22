import { useCallback, useMemo, useState } from 'react';
import type { ApiClient } from '../../shared/api-client';
import { academicOfferingApi } from './api';
import { GroupForm } from './group-form';
import { ScheduleEditor } from './schedule-editor';
import { LoadingState, OfferingLayout, stateLabels, useOfferingResource } from './offering-state';

export function AdminGroupPage({ api, id, navigate }: { api: ApiClient; id: string; navigate: (path: string) => void }) {
  const client = useMemo(() => academicOfferingApi(api), [api]); const load = useCallback((signal: AbortSignal) => client.group(id, signal), [client, id]);
  const resource = useOfferingResource(load); const [busy, setBusy] = useState(false); const [formVersion, setFormVersion] = useState(0);
  return <OfferingLayout title="Preparar grupo"><LoadingState loading={resource.loading} error={resource.error} retry={resource.reload}/>
    {resource.data && <><p><a href={`/admin/oferta/cursos/${resource.data.courseId}`}>Volver al curso</a></p>
      <p>{stateLabels[resource.data.state]} · {resource.data.studentVisible ? 'Visible para alumnos' : 'No visible para alumnos'}</p>
      <p>Capacidad máxima: {resource.data.capacity === null ? 'Sin configurar' : `${resource.data.capacity} alumnos`}. Ocupación y disponibilidad no calculadas.</p>
      {resource.data.teacher && !resource.data.teacher.eligible && <p>Docente no habilitado: {resource.data.teacher.name}</p>}
      {resource.data.teacherReviewRequired && <p>Revisión docente requerida. Recuperar habilitación no republica el grupo.</p>}
      <GroupForm key={`group-${formVersion}`} client={client} courseId={resource.data.courseId} initial={resource.data} busy={busy} onBusy={setBusy}
        onSaved={resource.accept} onCancel={() => navigate(`/admin/oferta/cursos/${resource.data!.courseId}`)} onDenied={resource.denied}
        onReplace={value => { resource.accept(value); setFormVersion(value => value + 1); }}/>
      <ScheduleEditor key={`schedule-${formVersion}`} client={client} group={resource.data} busy={busy} onBusy={setBusy} onSaved={resource.accept}
        onDenied={resource.denied} onReplace={value => { resource.accept(value); setFormVersion(value => value + 1); }}/>
    </>}
  </OfferingLayout>;
}
