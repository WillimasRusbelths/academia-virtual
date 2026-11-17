import { useCallback, useMemo, useState } from 'react';
import type { ApiClient } from '../../shared/api-client';
import { FormField } from '../../shared/ui/form-field';
import { academicOfferingApi } from './api';
import type { Page } from './api';
import { CatalogLoading, OfferingLayout, useOfferingResource } from './offering-state';

export function CatalogPagination({ value, label, onPage }: { value: Page<unknown>; label: string; onPage: (page: number) => void }) {
  return <nav aria-label={`Paginación de ${label}`}><p>Página {value.page} · {value.total} {label}</p>
    <button type="button" disabled={value.page <= 1} onClick={() => onPage(value.page - 1)}>Página anterior</button>
    <button type="button" disabled={value.page * value.pageSize >= value.total} onClick={() => onPage(value.page + 1)}>Página siguiente</button>
  </nav>;
}
export function CatalogPage({ api, reservationHref }: { api: ApiClient; reservationHref?: string }) {
  const client = useMemo(() => academicOfferingApi(api), [api]);
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState({ q: '', page: 1, pageSize: 20 });
  const load = useCallback((signal: AbortSignal) => client.catalog(filter, signal), [client, filter]); const resource = useOfferingResource(load);
  return <OfferingLayout catalog reservationHref={reservationHref} title="Oferta académica"><p>Consulta los cursos y compara sus grupos publicados.</p>
    <p>Ocupación y disponibilidad no calculadas</p>
    <form aria-label="Buscar oferta" onSubmit={event => { event.preventDefault(); setFilter({ ...filter, q: search.trim(), page: 1 }); }}>
      <FormField id="catalog-search" label="Buscar curso por nombre" value={search} onChange={event => setSearch(event.target.value)}/>
      <button type="submit">Buscar cursos</button>
    </form>
    <CatalogLoading loading={resource.loading} error={resource.error} retry={resource.reload}/>
    {resource.data && <>{resource.data.items.length ? <ul className="offering-list">{resource.data.items.map(course =>
      <li key={course.id}><h2><a href={`/oferta/cursos/${course.id}`}>{course.name}</a></h2><p>{course.description}</p></li>)}</ul>
      : <p>{filter.q ? 'No hay oferta publicada que coincida con la búsqueda' : 'No hay oferta publicada'}</p>}
      <CatalogPagination value={resource.data} label="cursos" onPage={page => setFilter({ ...filter, page })}/>
    </>}
  </OfferingLayout>;
}
