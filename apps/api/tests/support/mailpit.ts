export const mailpitOrigin = process.env.MAILPIT_URL;
if (mailpitOrigin !== 'http://mailpit:8025') throw new Error('Mailpit debe ser el servicio local de Compose.');

export async function assertMailpitAvailable() {
  const response = await fetch(`${mailpitOrigin}/api/v1/info`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`Mailpit local no disponible (${response.status}).`);
}

export async function waitForCapturedSubject(subject: string, timeoutMs = 5000) {
  if (!subject.startsWith('V00-') && !subject.startsWith('TEST-')) {
    throw new Error('Asunto de prueba sin prefijo aislado.');
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${mailpitOrigin}/api/v1/search?query=${encodeURIComponent(`subject:${subject}`)}`);
    if (!response.ok) throw new Error(`Consulta Mailpit falló (${response.status}).`);
    const result = await response.json() as { messages?: Array<{ Subject?: string }> };
    if (result.messages?.some((message) => message.Subject === subject)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Mailpit no capturó el asunto esperado dentro del plazo.');
}
