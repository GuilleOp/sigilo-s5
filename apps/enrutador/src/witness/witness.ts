// Vuelta del testigo de la bitácora nacional; vive en @sigilo/red para que un nodo testigo también
// la use. Este módulo la reexporta para el proceso testigo del enrutador.
export { runWitnessOnce } from '@sigilo/red/witness';
export type { WitnessDeps, WitnessOutcome } from '@sigilo/red/witness';
