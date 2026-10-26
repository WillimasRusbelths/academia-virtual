import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ApiFailure, RequestCancelled } from '../../shared/api-client';
import { Feedback } from '../../shared/ui/feedback';
import type { AdminCourse, AdminGroup, PreparedCommand } from './api';
import './offering.css';

export const stateLabels = { DRAFT: 'Borrador', PUBLISHED: 'Publicado', WITHDRAWN: 'Retirado', CANCELLED: 'Cancelado' };
export function safeFailure(value: unknown): ApiFailure {
  return value instanceof ApiFailure ? value : new ApiFailure(503, 'TEMPORARILY_UNAVAILABLE', 'Servicio temporalmente no disponible. Comprueba el estado antes de reintentar.');
}
export function OfferingLayout({ title, children, catalog = false }: { title: string; children: ReactNode; catalog?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return <main className="offering-page"><h1 ref={heading} tabIndex={-1}>{title}</h1>
    <nav aria-label="Navegación de oferta"><a href="/inicio">Inicio</a> · {catalog ? <a href="/oferta">Oferta</a> : <><a href="/admin/oferta">Cursos</a> · <a href="/admin/cuentas">Gestionar cuentas</a></>}</nav>{children}</main>;
}
export function CatalogLoading({ loading, error, retry }: { loading: boolean; error?: ApiFailure; retry: () => void }) {
  return error?.status === 404 ? <p role="status">Oferta no disponible</p> : <LoadingState loading={loading} error={error} retry={retry}/>;
}
export const weekDays = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export function useOfferingResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T>(); const [error, setError] = useState<ApiFailure>();
  const [loading, setLoading] = useState(true); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let live = true;
    setLoading(true); setError(undefined); setData(undefined);
    void load(controller.signal).then(value => { if (live) { setData(value); setLoading(false); } }, failure => {
      if (live && !(failure instanceof RequestCancelled)) { setData(undefined); setError(safeFailure(failure)); setLoading(false); }
    });
    return () => { live = false; controller.abort(); };
  }, [load, revision]);
  return { data, error, loading, accept: setData,
    denied(failure: ApiFailure) { setData(undefined); setError(failure); },
    reload() { setData(undefined); setError(undefined); setLoading(true); setRevision(value => value + 1); } };
}
export function LoadingState({ loading, error, retry }: { loading: boolean; error?: ApiFailure; retry: () => void }) {
  return <>{loading && <p role="status">Consultando oferta…</p>}<Feedback error={error} onRetry={retry}/></>;
}
export function useOfferingCommand<T>() {
  const [pending, setPending] = useState(false); const busy = useRef(false); const live = useRef(true);
  const [error, setError] = useState<ApiFailure>(); const [message, setMessage] = useState<string>();
  const saved = useRef<{ key: string; intent: PreparedCommand<T> } | undefined>(undefined); const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => { live.current = true; return () => { live.current = false; controller.current?.abort(); saved.current = undefined; }; }, []);
  async function run(key: string, prepare: () => PreparedCommand<T>, accept: (value: T) => void, denied: (error: ApiFailure) => void,
    notify: (busy: boolean) => void = () => undefined) {
    if (busy.current) return; busy.current = true; setPending(true); setError(undefined); setMessage(undefined); notify(true);
    try {
      if (saved.current?.key !== key) saved.current = { key, intent: prepare() };
      controller.current = new AbortController(); const result = await saved.current!.intent.send(controller.current.signal);
      if (live.current) { saved.current = undefined; accept(result.resource); setMessage('Cambios guardados.'); }
    } catch (failure) {
      if (live.current && !(failure instanceof RequestCancelled)) {
        const safe = safeFailure(failure);
        setError(safe.status === 503 ? new ApiFailure(503, safe.code,
          'Servicio temporalmente no disponible. El resultado es incierto. Comprueba el estado antes de reintentar. Salir no deshace un comando que pueda haberse aplicado.',
          safe.retryAfterSeconds, safe.fields, safe.conflictingGroupIds) : safe);
        if (safe.status === 401 || safe.status === 403) { saved.current = undefined; denied(safe); }
      }
    } finally { busy.current = false; if (live.current) { setPending(false); notify(false); } }
  }
  return { pending, error, message, run, discard() {
    if (busy.current) return;
    saved.current = undefined; setError(undefined); setMessage(undefined);
  }, changed() {
    setError(current => current && (current.status === 503 || ['OFFERING_VERSION_CONFLICT', 'OFFERING_STATE_CONFLICT'].includes(current.code)) ? current : undefined);
    setMessage(undefined);
  } };
}
/** Modal nativo: foco contenido, Escape no interrumpe un envío y retorno a cargo del disparador. */
export function OfferingConfirmation({ title, children, pending, cancel, confirm }: {
  title: string; children: ReactNode; pending: boolean; cancel: () => void; confirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => { if (element.open) element.close(); }; }, []);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-busy={pending}
    onCancel={event => { event.preventDefault(); if (!pending) cancel(); }}>
    <h2 id={titleId}>{title}</h2>{children}
    <button type="button" autoFocus disabled={pending} onClick={cancel}>Cancelar</button>
    <button type="button" disabled={pending} onClick={confirm}>{pending ? 'Confirmando…' : title}</button>
  </dialog>;
}
export function focusInvalid(form: RefObject<HTMLFormElement | null>) {
  requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}
/** Consulta aparte para comparar; nunca cambia la revisión de un borrador automáticamente. */
export function OfferingReview<T extends AdminCourse | AdminGroup>({ load, replace, denied, disabled = false }: {
  load: () => Promise<T>; replace: (value: T) => void; denied: (error: ApiFailure) => void; disabled?: boolean;
}) {
  const [value, setValue] = useState<T>(); const [error, setError] = useState<ApiFailure>(); const [busy, setBusy] = useState(false);
  return <section aria-label="Comparar datos guardados"><button type="button" disabled={busy || disabled} onClick={() => {
    setBusy(true); setError(undefined); void load().then(setValue, failure => {
      if (failure instanceof RequestCancelled) return;
      const safe = safeFailure(failure); setError(safe); if (safe.status === 401 || safe.status === 403) denied(safe);
    }).finally(() => setBusy(false));
  }}>Consultar datos guardados</button><Feedback error={error}/>{value && <>
    <p>Datos guardados: {value.name} · {stateLabels[value.state]} · Actualización: {value.updatedAt}</p>
    {'capacity' in value && <p>Capacidad: {value.capacity ?? 'Sin configurar'} · Periodo: {value.periodStart ?? 'Sin configurar'} — {value.periodEnd ?? 'Sin configurar'}</p>}
    {'description' in value && <p>Descripción guardada: {value.description ?? 'Sin configurar'}</p>}
    {'schedule' in value && <><p>Docente guardado: {value.teacher?.name ?? 'Sin asignar'} · America/Lima</p>
      <ul>{value.schedule.map((slot, index) => <li key={index}>Día {slot.dayOfWeek}: {slot.startTime}–{slot.endTime}</li>)}</ul></>}
    <button type="button" disabled={disabled} onClick={() => replace(value)}>Descartar edición y cargar datos guardados</button>
  </>}</section>;
}
