import type { ReactNode } from 'react';
import { ApiFailure } from '../../shared/api-client';
import type { UserView } from '../../shared/user-view';
import './admin-users.css';

export const roleLabels={STUDENT:'Alumno',TEACHER:'Docente',ADMIN:'Administrador'};
export const statusLabels={ACTIVE:'Activo',DISABLED:'Desactivado'};
export function adminFailure(error:unknown):ApiFailure {
  if(error instanceof ApiFailure) {
    if(error.code==='ADMIN_INVARIANT')return new ApiFailure(409,error.code,'No se permite cambiar el rol propio, desactivarse ni retirar al último administrador activo.');
    return error;
  }
  return new ApiFailure(503,'TEMPORARILY_UNAVAILABLE','Servicio temporalmente no disponible. Puedes reintentar manualmente.');
}
export function AdminLayout({title,children}:{title:string;children:ReactNode}) {
  return <main className="admin-page"><h1>{title}</h1><nav aria-label="Navegación administrativa"><a href="/inicio">Inicio</a> · <a href="/admin/cuentas">Cuentas</a></nav>{children}</main>;
}
export function AccountFacts({user}:{user:UserView}) {
  return <dl className="account-facts"><dt>Correo</dt><dd>{user.email}</dd><dt>Rol actual</dt><dd>{roleLabels[user.role]}</dd>
    <dt>Estado actual</dt><dd>{statusLabels[user.status]}</dd><dt>Correo verificado</dt><dd>{user.emailVerified?'Sí':'Pendiente'}</dd>
    <dt>Contraseña propia</dt><dd>{user.mustSetPassword?'Pendiente de establecer':'Establecida'}</dd><dt>Creación</dt><dd><time dateTime={user.createdAt}>{user.createdAt}</time></dd></dl>;
}
export function nameError(value:string) {return Array.from(value.trim()).length<1||Array.from(value.trim()).length>100?'Usa entre 1 y 100 caracteres.':undefined;}
