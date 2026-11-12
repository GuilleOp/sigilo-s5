#!/usr/bin/env node
// Entrada del CLI `sigilo` dentro de la imagen publicada. Lo llaman los envoltorios `sigilo` y
// `sigilo-sesna` (instalacion/), que solo necesitan Docker. Ver docs/instalacion-nodo.md.
import { runProgram } from './programa.ts';

// Seguridad: llaves y secretos se crean 0600 y las carpetas 0700 aunque el umask sea 022.
process.umask(0o077);
process.exitCode = await runProgram(process.argv.slice(2));
