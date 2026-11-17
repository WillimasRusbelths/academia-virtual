import { useCallback, useMemo, useState } from 'react';
import type { ApiClient } from '../../shared/api-client';
import { academicOfferingApi } from './api';
import type { CatalogGroup } from './api';
import { CatalogPagination } from './catalog-page';
import { CatalogLoading, OfferingLayout, useOfferingResource, weekDays } from './offering-state';

export function GroupSummary({ group }: { group: CatalogGroup }) {
  return <><p>Docente: <span>{group.teacher.name}</span></p><p>Periodo: {group.periodStart} — {group.periodEnd}</p>
    <p>Zona horaria: America/Lima</p>
    <ul>{group.schedule.map((slot, index) => <li key={index}>{weekDays[slot.dayOfWeek - 1]}: {slot.startTime}–{slot.endTime}</li>)}</ul>
    <p>Capacidad máxima: {group.capacity} alumnos</p><p>Ocupación y disponibilidad no calculadas</p></>;
}
export function CoursePage({ api, id, reservationHref }: { api: ApiClient; id: string; reservationHref?: string }) {
  const client = useMemo(() => academicOfferingApi(api), [api]); const [page, setPage] = useState(1);
  const load = useCallback(async (signal: AbortSignal) => {
    const [course, groups] = await Promise.all([client.catalogCourse(id, signal), client.catalogGroups(id, { page, pageSize: 20 }, signal)]);
    return { course, groups };
  }, [client, id, page]); const resource = useOfferingResource(load);
  return <OfferingLayout catalog reservationHref={reservationHref} title="Consultar curso"><CatalogLoading loading={resource.loading} error={resource.error} retry={resource.reload}/>
    {resource.data && <><h2>{resource.data.course.name}</h2><p>{resource.data.course.description}</p><h2>Grupos publicados</h2>
      {resource.data.groups.items.length ? <ul className="offering-list">{resource.data.groups.items.map(group =>
        <li key={group.id}><h3><a href={`/oferta/cursos/${id}/grupos/${group.id}`}>{group.name}</a></h3><GroupSummary group={group}/></li>)}</ul>
        : <p>No hay grupos publicados en esta página.</p>}
      <CatalogPagination value={resource.data.groups} label="grupos" onPage={setPage}/>
    </>}
  </OfferingLayout>;
}
