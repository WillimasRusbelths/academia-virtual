import { authenticationIteration, options as historicalOptions } from './authentication.js';
import { summary } from './client.js';

// Perfil independiente preparado, NO ejecutado. No modifica ID-LOAD-01/02 ni el runner.
// Seguimiento de identidad local: VU configurados no demuestran reservas o 2500 activos.
export const followupStages = [
  { duration: '2m', target: 10 },
  { duration: '0s', target: 25 },
  { duration: '2m', target: 25 },
];
export const options = { ...historicalOptions, scenarios: {
  local_followup: { executor: 'ramping-vus', startVUs: 10, stages: followupStages,
    gracefulRampDown: '15s', gracefulStop: '15s' },
} };
export default authenticationIteration;
export const handleSummary = summary;
