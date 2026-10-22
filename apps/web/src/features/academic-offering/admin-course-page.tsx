import { useCallback, useMemo, useState } from 'react';
import type { ApiClient } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { academicOfferingApi } from './api';
import type { GroupFilters } from './api';
import { CourseForm } from './course-form';
import { GroupForm } from './group-form';
import { LoadingState, OfferingLayout, stateLabels, useOfferingResource } from './offering-state';

export function AdminCoursePage({ api, id, navigate }: { api: ApiClient; id: string; navigate: (path: string) => void }) {
  const client = useMemo(() => academicOfferingApi(api), [api]); const load = useCallback((signal: AbortSignal) => client.course(id, signal), [client, id]);
  const resource = useOfferingResource(load); const [creating, setCreating] = useState(false); const [formVersion, setFormVersion] = useState(0);
  const [filter, setFilter] = useState<GroupFilters>({ page: 1, pageSize: 20 }); const [search, setSearch] = useState(''); const [state, setState] = useState('');
  const loadGroups = useCallback((signal: AbortSignal) => client.groups(id, filter, signal), [client, id, filter]); const groups = useOfferingResource(loadGroups);
  return <OfferingLayout title="Preparar curso"><LoadingState loading={resource.loading} error={resource.error} retry={resource.reload}/>
    {resource.data && <><p>{resource.data.name} · {stateLabels[resource.data.state]} · {resource.data.studentVisible ? 'Visible para alumnos' : 'No visible para alumnos'}</p>
      {creating ? <><h2>Crear grupo</h2><GroupForm client={client} courseId={id} onSaved={value => navigate(`/admin/oferta/grupos/${value.id}`)} onCancel={() => setCreating(false)} onDenied={resource.denied}/></>
        : <><CourseForm key={formVersion} client={client} initial={resource.data} onSaved={resource.accept} onCancel={() => navigate('/admin/oferta')}
          onDenied={resource.denied} onReplace={value => { resource.accept(value); setFormVersion(value => value + 1); }}/>
          <section aria-label="Grupos del curso"><h2>Grupos</h2><button type="button" onClick={() => setCreating(true)}>Crear grupo</button>
            <form aria-label="Buscar grupos" onSubmit={event => { event.preventDefault(); setFilter({ page: 1, pageSize: 20, q: search.trim(), ...(state ? { state: state as GroupFilters['state'] } : {}) }); }}>
              <FormField id="group-search" label="Buscar grupo por nombre" value={search} onChange={event => setSearch(event.target.value)}/>
              <label htmlFor="group-state">Estado del grupo</label><select id="group-state" value={state} onChange={event => setState(event.target.value)}><option value="">Todos</option>
                {Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="submit">Buscar grupos</button></form>
            <LoadingState loading={groups.loading} error={groups.error} retry={groups.reload}/>{groups.data && <>
              {groups.data.items.length ? <ul className="offering-list" aria-label="Grupos">{groups.data.items.map(group => <li key={group.id}><a href={`/admin/oferta/grupos/${group.id}`}>{group.name}</a> · {stateLabels[group.state]} · Capacidad: {group.capacity ?? 'Sin configurar'}</li>)}</ul> : <p>No hay grupos que coincidan.</p>}
              <nav aria-label="Paginación de grupos"><p>Página {groups.data.page} · {groups.data.total} grupos</p>
                <button type="button" disabled={groups.loading || groups.data.page <= 1} onClick={() => setFilter({ ...filter, page: groups.data!.page - 1 })}>Grupos anteriores</button>
                <button type="button" disabled={groups.loading || groups.data.page * groups.data.pageSize >= groups.data.total} onClick={() => setFilter({ ...filter, page: groups.data!.page + 1 })}>Grupos siguientes</button></nav>
            </>}
          </section></>}
    </>}
  </OfferingLayout>;
}
