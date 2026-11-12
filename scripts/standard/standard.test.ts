// Pruebas del Estándar S5: `estandar/` al día respecto de contracts, OpenAPI 3.1 y 3.0.3 válidos,
// perfiles por grupo (el PDN con solo sus rutas), ejemplos que cumplen sus esquemas, todas las
// rutas documentadas, diccionarios con el formato de la PDN y catálogos en pares CSV y JSON.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  ApiErrorCodeSchema,
  CORROBORATION_ROUTES,
  NETWORK_ROUTES,
  OFFENSES,
  PDN_ROUTES,
  ROUTES,
  STATES,
} from '@sigilo/contracts';
import {
  CORROBORATION_COMPONENTS,
  CORROBORATION_OPERATIONS,
  NETWORK_COMPONENTS,
  NETWORK_OPERATIONS,
  STANDARD_EXAMPLES,
  STANDARD_OPERATIONS,
} from '@sigilo/contracts/standard';
import { STANDARD_VERSION } from '@sigilo/contracts/standard';
import type { StandardExampleName } from '@sigilo/contracts/standard';
import {
  EXAMPLES_DIR,
  OPENAPI_30_FILE,
  STANDARD_DIR,
  buildOpenApiDocuments,
  buildStandardFiles,
  swaggerUrls,
  validateOpenApi,
} from './build.ts';
import { CATALOGS_DIR, S3_TIPO_FALTA, buildCatalogs } from './catalogs.ts';
import { buildDictionaryRows, pointerOf } from './dictionary.ts';
import {
  PDN_PROFILE,
  PROFILES_DIR,
  STANDARD_PROFILES,
  buildProfileDocument,
  toSchema30,
} from './profiles.ts';
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
    // Generar los 120 archivos y validar cada OpenAPI tarda varios segundos con la máquina cargada.
  }, 30_000);

  it('el YAML y el JSON dicen lo mismo, también para un lector de YAML 1.1', () => {
    for (const base of ['openapi', `${PROFILES_DIR}/${PDN_PROFILE.file}`]) {
      const yamlText = readFileSync(join(STANDARD_DIR, `${base}.yaml`), 'utf8');
      const json: unknown = JSON.parse(readFileSync(join(STANDARD_DIR, `${base}.json`), 'utf8'));
      expect(parse(yamlText, { version: '1.1' })).toEqual(json);
      expect(parse(yamlText)).toEqual(json);
    }
  });

  it('Swagger UI ofrece un documento por grupo y cada uno existe en disco', () => {
    const urls = swaggerUrls();
    expect(urls.map((item) => item.name)).toEqual([
      ...STANDARD_PROFILES.map((profile) => profile.name),
      'S5 - Estándar completo (OpenAPI 3.1)',
    ]);
    for (const item of urls) {
      expect(existsSync(join(STANDARD_DIR, 'swagger', item.url)), item.url).toBe(true);
    }
    const html = readFileSync(join(STANDARD_DIR, 'swagger', 'index.html'), 'utf8');
    // Sin CDN: todo se carga del mismo origen.
    expect(html).not.toMatch(/https?:\/\//u);
    expect(html).toContain('vendor/swagger-ui-standalone-preset.js');
  });
});

describe('OpenAPI 3.0.3 para el Swagger UI de la PDN', () => {
  it('el completo y cada perfil son OpenAPI 3.0.3 válidos (el visor de la PDN solo lee 3.0.x)', async () => {
    const documents = buildOpenApiDocuments();
    expect([...documents.keys()].sort()).toEqual(
      [
        'openapi.json',
        OPENAPI_30_FILE,
        ...STANDARD_PROFILES.map((profile) => `${PROFILES_DIR}/${profile.file}.json`),
      ].sort(),
    );
    for (const [path, document] of documents) {
      if (path === 'openapi.json') continue;
      // La misma comprobación que hace el Swagger UI de la PDN.
      expect(String(document.openapi).startsWith('3.0.'), path).toBe(true);
      expect(document.openapi).toBe('3.0.3');
      await expect(validateOpenApi(document), path).resolves.toBeUndefined();
    }
  });

  it('el validador de 3.0 rechaza palabras de 3.1 (const, examples, tipos con null)', async () => {
    const documents = buildOpenApiDocuments();
    const pdn = structuredClone(documents.get(`${PROFILES_DIR}/${PDN_PROFILE.file}.json`) ?? {});
    const schemas = (pdn.components as { schemas: Record<string, JsonObject> }).schemas;
    const resError = schemas.resError ?? {};
    resError.const = 1;
    await expect(validateOpenApi(pdn)).rejects.toThrow();
  });

  it('convierte sin perder significado lo que 3.0 escribe distinto', () => {
    expect(toSchema30({ const: 'a' })).toEqual({ enum: ['a'], type: 'string' });
    expect(
      toSchema30({ anyOf: [{ type: 'integer', minimum: 5 }, { type: 'null' }], description: 'd' }),
    ).toEqual({ type: 'integer', minimum: 5, description: 'd', nullable: true });
    expect(toSchema30({ anyOf: [{ $ref: '#/x' }, { type: 'null' }] })).toEqual({
      allOf: [{ $ref: '#/x' }],
      nullable: true,
    });
    expect(toSchema30({ type: 'integer', exclusiveMinimum: 0, examples: [3] })).toEqual({
      type: 'integer',
      minimum: 0,
      exclusiveMinimum: true,
      example: 3,
    });
    expect(
      toSchema30({
        type: 'object',
        propertyNames: { enum: ['a', 'b'] },
        additionalProperties: { type: 'integer' },
        required: ['a', 'b'],
      }),
    ).toEqual({
      type: 'object',
      properties: { a: { type: 'integer' }, b: { type: 'integer' } },
      additionalProperties: false,
      required: ['a', 'b'],
    });
    expect(toSchema30({ $ref: '#/x', description: 'd' })).toEqual({
      description: 'd',
      allOf: [{ $ref: '#/x' }],
    });
  });

  it('el perfil PDN trae solo lo que consume la SESNA, con resError', () => {
    const profile = buildProfileDocument(buildOpenApiDocument(), PDN_PROFILE);
    expect(Object.keys(profile.paths as JsonObject).sort()).toEqual(
      Object.values(PDN_ROUTES).sort(),
    );
    const schemas = Object.keys((profile.components as { schemas: JsonObject }).schemas);
    expect(schemas).toContain('resError');
    expect(schemas).not.toContain('PdnError');
    expect(schemas).not.toContain('ApiError');
    expect(schemas).not.toContain('SubmitComplaintRequest');
    expect(JSON.stringify(profile)).not.toContain('#/components/schemas/PdnError"');
    expect((profile.info as JsonObject).version).toBe(STANDARD_VERSION);
    const paths = profile.paths as Record<string, Record<string, JsonObject>>;
    for (const item of Object.values(paths)) {
      for (const operation of Object.values(item)) {
        const responses = operation.responses as Record<string, JsonObject>;
        for (const [status, response] of Object.entries(responses)) {
          if (Number(status) < 400) continue;
          const content = response.content as Record<string, { schema: { $ref: string } }>;
          expect(content['application/json']?.schema.$ref).toMatch(/resError(Token)?$/u);
        }
      }
    }
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

  it('tiene el encabezado y las columnas del diccionario oficial de la PDN', () => {
    for (const file of ['diccionario-de-datos.csv', 'diccionario-de-datos-pdn.csv']) {
      const lines = readFileSync(join(STANDARD_DIR, file), 'utf8').split('\n');
      expect(lines.slice(0, 5).map((line) => line.split(',')[0])).toEqual([
        'Nombre',
        'Objetivo',
        'Fecha de última actualización',
        'Versión del estándar',
        'Liga swagger',
      ]);
      expect(lines[5]?.split(',').slice(0, 7)).toEqual([
        'Path',
        'Variable',
        'Obligatorio',
        'Formato',
        'Tipo de dato',
        'Público',
        'Descripción',
      ]);
    }
    const rows = buildDictionaryRows(buildComponentSchemas());
    const state = rows.find((row) => row.schema === 'ComplaintFacts' && row.path === 'stateCode');
    expect(state && pointerOf(state)).toBe('/ComplaintFacts');
    expect(state?.isPublic).toBe(false);
    const capture = rows.find(
      (row) => row.schema === 'PdnStatisticsRow' && row.path === 'fechaCaptura',
    );
    expect(capture).toMatchObject({ pdnType: 'Date Time', isPublic: true });
    // La identidad y el contacto nunca son públicos.
    expect(rows.filter((row) => row.schema === 'IdentityBlock').every((row) => !row.isPublic)).toBe(
      true,
    );
  });
});

describe('catálogos', () => {
  it('cada catálogo es un par JSON y CSV de filas {clave, valor} sin claves repetidas', () => {
    const catalogs = buildCatalogs();
    expect(catalogs.map((catalog) => catalog.name)).toEqual([
      'faltas',
      'entidades',
      'municipios',
      'funciones-tabla',
      'funciones-cuenta',
      'motivos-cierre',
      'estatus-denuncia',
    ]);
    for (const catalog of catalogs) {
      const json = JSON.parse(
        readFileSync(join(STANDARD_DIR, CATALOGS_DIR, `${catalog.name}.json`), 'utf8'),
      ) as { clave: string; valor: string }[];
      expect(json).toEqual(catalog.rows);
      expect(new Set(json.map((row) => row.clave)).size).toBe(json.length);
      const csv = readFileSync(join(STANDARD_DIR, CATALOGS_DIR, `${catalog.name}.csv`), 'utf8');
      expect(csv.split('\n')[0]?.startsWith('clave,valor')).toBe(true);
      expect(csv.trimEnd().split('\n')).toHaveLength(json.length + 1);
    }
    expect(catalogs.find((catalog) => catalog.name === 'entidades')?.rows).toHaveLength(
      STATES.length,
    );
  });

  it('las faltas traen la clave de su ley y el puente con tipoFalta del S3 solo en la LGRA', () => {
    const faltas = buildCatalogs().find((catalog) => catalog.name === 'faltas')?.rows ?? [];
    const codes = OFFENSES.flatMap((offense) => [offense.code, ...offense.equivalentCodes]);
    expect(faltas.map((row) => row.clave).sort()).toEqual([...codes].sort());
    expect(faltas.find((row) => row.clave === 'LGRA-52')).toMatchObject({
      claveLey: 'LGRA',
      s3TipoFalta: 'CEX',
    });
    expect(faltas.find((row) => row.clave === 'LGRA-53')?.s3TipoFalta).toBe('PEC');
    expect(faltas.find((row) => row.clave === 'LGRA-58')?.s3TipoFalta).toBe('ABCI');
    expect(faltas.find((row) => row.clave === 'CPF-222')).toMatchObject({
      claveLey: 'CPF',
      gravedad: 'Hecho de corrupción',
      s3TipoFalta: null,
      equivaleA: 'LGRA-52',
    });
    for (const code of Object.keys(S3_TIPO_FALTA)) expect(codes).toContain(code);
  });
});
