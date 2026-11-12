// Pruebas del Estándar S5: `estandar/` al día respecto de contracts, OpenAPI 3.1 válido, ejemplos
// que cumplen sus esquemas, todas las rutas documentadas y diccionario completo.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  ApiErrorCodeSchema,
  CORROBORATION_ROUTES,
  NETWORK_ROUTES,
  ROUTES,
} from '@sigilo/contracts';
import {
  CORROBORATION_COMPONENTS,
  CORROBORATION_OPERATIONS,
  NETWORK_COMPONENTS,
  NETWORK_OPERATIONS,
  STANDARD_EXAMPLES,
  STANDARD_OPERATIONS,
} from '@sigilo/contracts/standard';
import type { StandardExampleName } from '@sigilo/contracts/standard';
import { EXAMPLES_DIR, STANDARD_DIR, buildStandardFiles, validateOpenApi } from './build.ts';
import { buildDictionaryRows } from './dictionary.ts';
import { buildComponentSchemas, buildOpenApiDocument } from './openapi.ts';
import type { JsonObject } from './openapi.ts';
import {
  PUBLISHED_COMPONENTS,
  PUBLISHED_EXAMPLES,
  PUBLISHED_EXTRA_EXAMPLES,
  PUBLISHED_OPERATIONS,
} from './published.ts';

/** Esquema con el que se valida cada archivo de ejemplo. */
function exampleSchemas(): Map<string, z.ZodType> {
  const schemas = new Map<string, z.ZodType>();
  for (const [component, example] of Object.entries(PUBLISHED_EXTRA_EXAMPLES)) {
    const schema = PUBLISHED_COMPONENTS[component];
    if (schema !== undefined) schemas.set(example, schema);
  }
  for (const operation of PUBLISHED_OPERATIONS) {
    for (const body of [operation.requestBody, operation.success.body]) {
      if (body?.kind !== 'json') continue;
      const schema = PUBLISHED_COMPONENTS[body.component];
      if (schema === undefined) throw new Error(`Falta el componente ${body.component}.`);
      schemas.set(body.example, body.isArray === true ? z.array(schema) : schema);
    }
  }
  return schemas;
}

describe('estandar/ generado', () => {
  it('está al día respecto de contracts (si falla, ejecuta npm run standard:build)', async () => {
    const files = await buildStandardFiles();
    const stale = [...files]
      .filter(([path, content]) => {
        const target = join(STANDARD_DIR, path);
        return !existsSync(target) || readFileSync(target, 'utf8') !== content;
      })
      .map(([path]) => path);
    expect(stale).toEqual([]);
    const onDisk = readdirSync(join(STANDARD_DIR, EXAMPLES_DIR)).map(
      (name) => `${EXAMPLES_DIR}/${name}`,
    );
    expect(onDisk.filter((path) => !files.has(path))).toEqual([]);
  });

  it('el YAML y el JSON dicen lo mismo, también para un lector de YAML 1.1', () => {
    const yamlText = readFileSync(join(STANDARD_DIR, 'openapi.yaml'), 'utf8');
    const json: unknown = JSON.parse(readFileSync(join(STANDARD_DIR, 'openapi.json'), 'utf8'));
    expect(parse(yamlText, { version: '1.1' })).toEqual(json);
    expect(parse(yamlText)).toEqual(json);
  });
});

describe('documento OpenAPI', () => {
  it('es OpenAPI 3.1 válido con JSON Schema 2020-12', async () => {
    const document = buildOpenApiDocument();
    expect(document.openapi).toBe('3.1.0');
    // Dialecto por omisión de OpenAPI 3.1: JSON Schema 2020-12 más el vocabulario de OpenAPI.
    expect(document.jsonSchemaDialect).toBeUndefined();
    const schemas = (document.components as { schemas: Record<string, JsonObject> }).schemas;
    expect(Object.values(schemas).some((schema) => '$schema' in schema)).toBe(false);
    await expect(validateOpenApi(document)).resolves.toBeUndefined();
  });

  it('el validador rechaza un documento dañado', async () => {
    const document = buildOpenApiDocument();
    const broken = { ...document, paths: { '/x': { get: { responses: 'no' } } } };
    await expect(validateOpenApi(broken)).rejects.toThrow();
    const dangling = structuredClone(document) as JsonObject;
    const components = dangling.components as { schemas: Record<string, unknown> };
    delete components.schemas.HpkeEnvelope;
    await expect(validateOpenApi(dangling)).rejects.toThrow();
  });

  it('documenta cada ruta de ROUTES una sola vez por método', () => {
    const paths = new Set(STANDARD_OPERATIONS.map((operation) => operation.path));
    for (const route of Object.values(ROUTES)) {
      const path = typeof route === 'string' ? route : route('{param}', '{param}');
      const matcher = new RegExp(`^${path.replaceAll('{param}', '\\{[A-Za-z]+\\}')}$`, 'u');
      expect(
        [...paths].some((candidate) => matcher.test(candidate)),
        path,
      ).toBe(true);
    }
    const keys = STANDARD_OPERATIONS.map((operation) => `${operation.method} ${operation.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = STANDARD_OPERATIONS.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada operación declara su seguridad y responde errores con el esquema común', () => {
    const document = buildOpenApiDocument();
    const paths = document.paths as Record<string, Record<string, JsonObject>>;
    for (const operation of PUBLISHED_OPERATIONS) {
      const item = paths[operation.path]?.[operation.method];
      expect(item, operation.operationId).toBeDefined();
      expect(Array.isArray(item?.security)).toBe(true);
      const responses = (item?.responses ?? {}) as Record<string, JsonObject>;
      expect(Object.keys(responses)).toContain('500');
      for (const [status, response] of Object.entries(responses)) {
        if (Number(status) < 400) continue;
        const content = response.content as Record<string, { schema: unknown }>;
        // El grupo «PDN» responde con los formatos de la PDN (`resError`) y de RFC 6749.
        const expected =
          'pdnErrors' in operation &&
          operation.pdnErrors.some((item) => String(item.status) === status)
            ? operation.pdnErrors.find((item) => String(item.status) === status)?.component
            : 'ApiError';
        expect(content['application/json']?.schema).toEqual({
          $ref: `#/components/schemas/${expected}`,
        });
      }
    }
    const pow = STANDARD_OPERATIONS.filter((operation) => operation.security === 'proofOfWork');
    expect(pow.map((operation) => operation.operationId).sort()).toEqual([
      'fileAppeal',
      'sendReporterMessage',
      'submitComplaint',
      'submitRegistration',
      'uploadEvidence',
    ]);
    const authority = STANDARD_OPERATIONS.filter((operation) =>
      operation.path.startsWith('/api/v1/authority/'),
    );
    expect(authority.every((operation) => operation.security === 'authorityBearer')).toBe(true);
  });

  it('traduce las validaciones de catálogos fijos a enum', () => {
    const facts = buildComponentSchemas().ComplaintFacts as {
      properties: Record<string, JsonObject>;
    };
    expect(facts.properties.stateCode?.enum).toHaveLength(32);
    expect(facts.properties.offenseCode?.enum).toContain('CPF-222');
    expect(facts.properties.entityId?.enum).toBeUndefined();
  });
});

describe('grupo «Red»', () => {
  it('documenta cada ruta de NETWORK_ROUTES una sola vez, separada de las del nodo', () => {
    const paths = new Set(NETWORK_OPERATIONS.map((operation) => operation.path));
    for (const route of Object.values(NETWORK_ROUTES)) {
      const path = typeof route === 'string' ? route : route('{nodeId}');
      expect(paths.has(path), path).toBe(true);
    }
    const nodePaths = new Set(STANDARD_OPERATIONS.map((operation) => operation.path));
    expect(NETWORK_OPERATIONS.some((operation) => nodePaths.has(operation.path))).toBe(false);
    const ids = PUBLISHED_OPERATIONS.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declara el servidor del enrutador en sus rutas y deja el buzón de red en el nodo', () => {
    const document = buildOpenApiDocument();
    const paths = document.paths as Record<string, JsonObject>;
    for (const operation of NETWORK_OPERATIONS) {
      const item = paths[operation.path];
      expect((item?.[operation.method] as JsonObject | undefined)?.tags).toEqual(['Red']);
      expect(item?.servers !== undefined, operation.operationId).toBe(
        operation.servedBy === 'router',
      );
    }
    expect((document.tags as { name: string }[]).map((tag) => tag.name)).toContain('Red');
  });

  it('el diccionario incluye los esquemas de la red', () => {
    const rows = buildDictionaryRows(buildComponentSchemas());
    for (const component of Object.keys(NETWORK_COMPONENTS)) {
      expect(
        rows.some((row) => row.schema === component),
        component,
      ).toBe(true);
    }
  });
});

describe('grupo «Corroboración»', () => {
  it('documenta cada ruta una sola vez, con el servidor del evaluador o del índice', () => {
    const paths = new Set(CORROBORATION_OPERATIONS.map((operation) => operation.path));
    for (const route of Object.values(CORROBORATION_ROUTES))
      expect(paths.has(route), route).toBe(true);
    const document = buildOpenApiDocument();
    const documented = document.paths as Record<string, JsonObject>;
    for (const operation of CORROBORATION_OPERATIONS) {
      const item = documented[operation.path];
      expect((item?.[operation.method] as JsonObject | undefined)?.tags).toEqual(['Corroboración']);
      const servers = item?.servers as { url: string }[] | undefined;
      expect(servers?.[0]?.url).toBe(
        operation.servedBy === 'evaluator' ? 'http://127.0.0.1:8791' : 'http://127.0.0.1:8792',
      );
    }
    expect((document.tags as { name: string }[]).map((tag) => tag.name)).toContain('Corroboración');
  });

  it('el diccionario incluye los esquemas de la corroboración', () => {
    const rows = buildDictionaryRows(buildComponentSchemas());
    for (const component of Object.keys(CORROBORATION_COMPONENTS)) {
      expect(
        rows.some((row) => row.schema === component),
        component,
      ).toBe(true);
    }
  });
});

describe('ejemplos', () => {
  it('cada archivo de estandar/ejemplos cumple el esquema de su cuerpo', () => {
    const schemas = exampleSchemas();
    const names = readdirSync(join(STANDARD_DIR, EXAMPLES_DIR)).map((name) =>
      name.replace(/\.json$/u, ''),
    );
    expect(names.sort()).toEqual([...schemas.keys()].sort());
    for (const name of names) {
      const value: unknown = JSON.parse(
        readFileSync(join(STANDARD_DIR, EXAMPLES_DIR, `${name}.json`), 'utf8'),
      );
      const result = schemas.get(name)?.safeParse(value);
      expect(result?.success, `${name}: ${result?.error?.message ?? ''}`).toBe(true);
    }
  });

  it('los ejemplos son los de contracts y un error usa un código válido', () => {
    expect(Object.keys(PUBLISHED_EXAMPLES).sort()).toEqual([...exampleSchemas().keys()].sort());
    const error = STANDARD_EXAMPLES.error;
    expect(ApiErrorCodeSchema.safeParse(error.error.code).success).toBe(true);
  });

  it('un ejemplo alterado deja de cumplir su esquema', () => {
    const schemas = exampleSchemas();
    const name: StandardExampleName = 'submit-complaint.request';
    const tampered = structuredClone(STANDARD_EXAMPLES[name]) as { mode: string };
    tampered.mode = 'anonymous';
    expect(schemas.get(name)?.safeParse(tampered).success).toBe(false);
  });
});

describe('diccionario de datos', () => {
  it('tiene una fila por campo de cada esquema, con descripción en español', () => {
    const components = buildComponentSchemas();
    const rows = buildDictionaryRows(components);
    for (const component of Object.keys(PUBLISHED_COMPONENTS)) {
      expect(
        rows.some((row) => row.schema === component),
        component,
      ).toBe(true);
    }
    const facts = rows.filter((row) => row.schema === 'ComplaintFacts').map((row) => row.path);
    expect(facts).toEqual([
      'stateCode',
      'municipalityCode',
      'entityId',
      'offenseCode',
      'occurredPeriod',
      'accused',
      'description',
    ]);
    const undescribed = rows.filter((row) => row.description === '');
    expect(undescribed.map((row) => `${row.schema}.${row.path}`)).toEqual([]);
    const view = rows.filter((row) => row.schema === 'TrackingView').map((row) => row.path);
    expect(view).toContain('messages');
    const ledger = rows.find((row) => row.schema === 'LedgerEvent' && row.path === 'receiptTag');
    expect(ledger?.isRequired).toBe(false);
  });
});
