import { useCallback, useMemo, useState } from 'react';
import type { ApiClient } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { academicOfferingApi } from './api';
import type { CourseFilters } from './api';
import { CourseForm } from './course-form';
import { LoadingState, OfferingLayout, stateLabels, useOfferingResource } from './offering-state';

export function AdminCoursesPage({ api, navigate }: { api: ApiClient; navigate: (path: string) => void }) {
  const client = useMemo(() => academicOfferingApi(api), [api]); const [filter, setFilter] = useState<CourseFilters>({ page: 1, pageSize: 20 });
  const [search, setSearch] = useState(''); const [state, setState] = useState(''); const [creating, setCreating] = useState(false);
  const load = useCallback((signal: AbortSignal) => client.courses(filter, signal), [client, filter]); const resource = useOfferingResource(load);
  return <OfferingLayout title="Gestión de oferta académica"><LoadingState loading={resource.loading} error={resource.error} retry={resource.reload}/>
    {resource.data && (creating ? <CourseForm client={client} onSaved={value => navigate(`/admin/oferta/cursos/${value.id}`)}
      onCancel={() => setCreating(false)} onDenied={resource.denied}/> : <>
      <form aria-label="Buscar cursos" onSubmit={event => { event.preventDefault(); setFilter({ page: 1, pageSize: 20, q: search.trim(), ...(state ? { state: state as CourseFilters['state'] } : {}) }); }}>
        <FormField id="course-search" label="Buscar curso por nombre" value={search} onChange={event => setSearch(event.target.value)}/>
        <label htmlFor="course-state">Estado del curso</label><select id="course-state" value={state} onChange={event => setState(event.target.value)}>
          <option value="">Todos</option>{(['DRAFT','PUBLISHED','WITHDRAWN'] as const).map(value => <option key={value} value={value}>{stateLabels[value]}</option>)}</select><button type="submit">Buscar cursos</button>
      </form><button type="button" onClick={() => setCreating(true)}>Crear curso</button>
      {resource.data.items.length ? <ul className="offering-list" aria-label="Cursos">{resource.data.items.map(course => <li key={course.id}>
        <a href={`/admin/oferta/cursos/${course.id}`}>{course.name}</a> · {stateLabels[course.state]}</li>)}</ul> : <p>No hay cursos que coincidan.</p>}
      <nav aria-label="Paginación de cursos"><p>Página {resource.data.page} · {resource.data.total} cursos</p>
        <button type="button" disabled={resource.loading || resource.data.page <= 1} onClick={() => setFilter({ ...filter, page: resource.data!.page - 1 })}>Anterior</button>
        <button type="button" disabled={resource.loading || resource.data.page * resource.data.pageSize >= resource.data.total} onClick={() => setFilter({ ...filter, page: resource.data!.page + 1 })}>Siguiente</button></nav>
    </>)}
  </OfferingLayout>;
}
