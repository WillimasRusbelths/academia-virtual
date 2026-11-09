import type { AppRoute } from './router';
import type { EnrollmentApi } from '../features/enrollment/api';
import { ReservationScreen } from '../features/enrollment/reservation-page';
import { OrdersScreen } from '../features/enrollment/order-page';
import { EnrollmentsScreen } from '../features/enrollment/enrollments-page';

export function enrollmentRoutes(api:EnrollmentApi):readonly AppRoute[]{
  return [
    {path:'/reservar',access:'enrollment',element:<ReservationScreen api={api}/>},
    {path:'/mis-ordenes',access:'enrollment',element:<OrdersScreen api={api}/>},
    {path:'/mis-ordenes/:id',access:'enrollment',render:params=><OrdersScreen api={api} orderId={params.id}/>},
    {path:'/mis-matriculas',access:'enrollment',element:<EnrollmentsScreen api={api}/>},
    {path:'/mis-matriculas/:id',access:'enrollment',render:params=><EnrollmentsScreen api={api} enrollmentId={params.id}/>},
  ];
}
