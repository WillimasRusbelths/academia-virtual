import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ApiClient } from '../../shared/api-client';
import { academicOfferingApi } from './api';
import type { TeachingGroup } from './api';
import { CatalogPagination } from './catalog-page';
import { LoadingState, OfferingLayout, stateLabels, useOfferingResource, weekDays } from './offering-state';

export function TeachingLayout({ title, children }: { title: string; children: ReactNode }) {
  return <OfferingLayout teaching title={title}>{children}</OfferingLayout>;
}
export function TeachingSummary({ group }: { group: TeachingGroup }) {
  return <><p>{stateLabels[group.state]}</p><p>Docente: {group.teacher.name}</p>
    <p>Periodo: {group.periodStart ?? 'Sin configurar'} — {group.periodEnd ?? 'Sin configurar'}</p>
    <p>Zona horaria: America/Lima</p>
    {group.schedule.length ? <ul>{group.schedule.map((slot, index) => <li key={index}>
      {weekDays[slot.dayOfWeek - 1].replace(/^./, letter => letter.toUpperCase())}: {slot.startTime}–{slot.endTime}</li>)}</ul> : <p>Horario: Sin configurar</p>}
    <p>Capacidad máxima: {group.capacity === null ? 'Sin configurar' : `${group.capacity} alumnos`}</p>
    <p>Ocupación y disponibilidad no calculadas</p></>;
}
export function TeachingGroupsPage({ api }: { api: ApiClient }) {
  const client = useMemo(() => academicOfferingApi(api), [api]); const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => client.teachingGroups({ page, pageSize: 20 }, signal), [client, page]);
  const resource = useOfferingResource(load);
  return <TeachingLayout title="Mis grupos"><p>Consulta los grupos que tienes asignados.</p>
    <LoadingState loading={resource.loading} error={resource.error} retry={resource.reload}/>
    {resource.data && <>{resource.data.items.length ? <ul className="offering-list">{resource.data.items.map(group =>
      <li key={group.id}><h2><a href={`/mis-grupos/${group.id}`}>{group.name}</a></h2><p>{group.course.name}</p><TeachingSummary group={group}/></li>)}</ul>
      : <p>No tienes grupos asignados en esta página.</p>}
      <CatalogPagination value={resource.data} label="grupos" onPage={setPage}/></>}
  </TeachingLayout>;
}
