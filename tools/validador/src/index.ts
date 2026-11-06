// Interfaz pública del validador para usarlo desde otro código (la CLI está en `cli.ts`).
export { CHECKS, getCheck } from './catalog.ts';
export { runValidation, DEFAULT_RUN_OPTIONS } from './run.ts';
export type { RunOptions } from './run.ts';
export { renderHtmlReport } from './report/html-report.ts';
export { renderJsonReport, writeReports, REPORT_SCHEMA_PATH } from './report/json-report.ts';
export type * from './types.ts';
export { TOOL_NAME, TOOL_VERSION, USER_AGENT } from './version.ts';
