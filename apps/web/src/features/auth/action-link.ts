/** Captura única en memoria. Incluso un fragmento inválido se retira antes de interactuar. */
export function takeActionLink(location:Location,history:History):string|null {
  const value=location.hash.slice(1);
  history.replaceState(null,'',location.pathname);
  return /^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
