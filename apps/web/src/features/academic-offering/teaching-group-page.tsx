import { useCallback, useMemo } from 'react';
import type { ApiClient } from '../../shared/api-client';
import { academicOfferingApi } from './api';
import { LoadingState, useOfferingResource } from './offering-state';
import { TeachingLayout, TeachingSummary } from './teaching-groups-page';

export function TeachingGroupPage({ api, id }: { api: ApiClient; id: string }) {
  const client = useMemo(() => academicOfferingApi(api), [api]);
  const load = useCallback((signal: AbortSignal) => client.teachingGroup(id, signal), [client, id]);
  const resource = useOfferingResource(load);
  return <TeachingLayout title="Consultar grupo">
    {resource.error?.status === 404 ? <p role="status">Grupo no disponible</p>
      : <LoadingState loading={resource.loading} error={resource.error} retry={resource.reload}/>}
    {resource.data && <><h2>{resource.data.name}</h2><p>{resource.data.course.name}</p>
      <p>{resource.data.course.description ?? 'Sin configurar'}</p><TeachingSummary group={resource.data}/></>}
  </TeachingLayout>;
}
