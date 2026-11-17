import type { AppRoute } from './router';
import type { EnrollmentApi,EnrollmentAdminApi } from '../features/enrollment/api';
import { PricesScreen } from '../features/enrollment/prices-page';
import type { CourseCatalog } from '../features/enrollment/prices-page';
import { CommitmentsScreen } from '../features/enrollment/commitments-page';
import { IncidentsScreen } from '../features/enrollment/incidents-page';
import { ReservationScreen } from '../features/enrollment/reservation-page';
import { OrdersScreen } from '../features/enrollment/order-page';
import { EnrollmentsScreen } from '../features/enrollment/enrollments-page';

export function enrollmentRoutes(api:EnrollmentApi,materialsHref?:(groupId:string)=>string,accountId='session'):readonly AppRoute[]{
  return [
    {path:'/reservar',access:'enrollment',element:<ReservationScreen api={api}/>},
    {path:'/mis-ordenes',access:'enrollment',element:<OrdersScreen api={api}/>},
    {path:'/mis-ordenes/:id',access:'enrollment',render:params=><OrdersScreen api={api} orderId={params.id}/>},
    {path:'/mis-matriculas',access:'enrollment',element:<EnrollmentsScreen key={accountId} api={api} materialsHref={materialsHref}/>},
    {path:'/mis-matriculas/:id',access:'enrollment',render:params=><EnrollmentsScreen key={`${accountId}:${params.id}`} api={api} enrollmentId={params.id} materialsHref={materialsHref}/>},
  ];
}
export function enrollmentAdminRoutes(api:EnrollmentAdminApi,catalog:CourseCatalog):readonly AppRoute[]{return [
  {path:'/admin/precios',access:'admin',element:<PricesScreen api={api} catalog={catalog}/>},
  {path:'/admin/compromisos',access:'admin',element:<CommitmentsScreen api={api}/>},
  {path:'/admin/incidencias/:id',access:'admin',render:params=><IncidentsScreen api={api} id={params.id}/>},
];}
