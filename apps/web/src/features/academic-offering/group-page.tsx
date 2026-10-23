import { useCallback, useMemo } from 'react';
import type { ApiClient } from '../../shared/api-client';
import { academicOfferingApi } from './api';
import { GroupSummary } from './course-page';
import { CatalogLoading, OfferingLayout, useOfferingResource } from './offering-state';

export function GroupPage({ api, courseId, id }: { api: ApiClient; courseId: string; id: string }) {
  const client = useMemo(() => academicOfferingApi(api), [api]);
  const load = useCallback(async (signal: AbortSignal) => {
    const [course, group] = await Promise.all([client.catalogCourse(courseId, signal), client.catalogGroup(courseId, id, signal)]);
    return { course, group };
  }, [client, courseId, id]); const resource = useOfferingResource(load);
  return <OfferingLayout catalog title="Consultar grupo"><CatalogLoading loading={resource.loading} error={resource.error} retry={resource.reload}/>
    {resource.data && <><p><a href={`/oferta/cursos/${courseId}`}>{resource.data.course.name}</a></p>
      <p>{resource.data.course.description}</p><h2>{resource.data.group.name}</h2><GroupSummary group={resource.data.group}/></>}
  </OfferingLayout>;
}
