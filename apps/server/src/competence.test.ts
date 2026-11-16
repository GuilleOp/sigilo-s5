// Pantalla «Competencia por dependencia» del nodo: la cuenta de operación ve cada dependencia de
// su entidad (del catálogo de la PDN) con quién la investiga, revisa los cambios y firma la versión
// nueva de la tabla de funciones con la llave del nodo. Ninguna otra cuenta entra.
import { describe, expect, it } from 'vitest';
import {
  CompetenceSaveResponseSchema,
  CompetenceViewSchema,
  ROUTES,
  entityAssignmentsOf,
} from '@sigilo/contracts';
import type { CompetenceSaveRequest, EntityAssignment } from '@sigilo/contracts';
import { functionTableProblems, verifyFunctionTableSignature } from '@sigilo/red';
import { createTestNetwork, networkToken } from './test-support/network-harness.ts';
import type { NetworkAccountName, TestNode } from './test-support/network-harness.ts';

function request(node: TestNode, account: NetworkAccountName, body?: CompetenceSaveRequest) {
  return node.app.request(ROUTES.operationCompetence, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${networkToken(account)}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('competencia por dependencia en el nodo', () => {
  it('lista las 145 dependencias de Querétaro con su grupo, su OIC y su distintivo', async () => {
    const network = createTestNetwork();
    const response = await request(network.queretaro, 'queretaroOperation');
    expect(response.status).toBe(200);
    const view = CompetenceViewSchema.parse(await response.json());
    expect(view).toMatchObject({ nodeId: 'node.queretaro', stateCode: '22' });
    expect(view.table.format).toBe(2);
    expect(view.entities.filter((item) => !item.isFictitious)).toHaveLength(145);
    const byId = new Map(view.entities.map((item) => [item.entityId, item]));
    expect(byId.get('PDN-22-7283')).toMatchObject({
      group: { key: 'municipio:014' },
      badge: 'keys',
      status: 'assigned',
    });
    expect(byId.get('PDN-22-7206')).toMatchObject({ group: { key: 'autonomo' }, badge: 'named' });
    expect(byId.get('PDN-22-7232')).toMatchObject({ badge: 'pending', holder: null });
    // Un municipio que no está en la tabla: pendiente, nunca la Contraloría.
    expect(byId.get('PDN-22-7267')).toMatchObject({ status: 'pending', source: 'none' });
    expect(view.authorities.map((item) => item.authorityId)).toContain('authority.oic-el-marques');
    expect(view.coverage.total).toBe(view.entities.length);
  });

  it('el nodo federal lista los entes federales del catálogo', async () => {
    const network = createTestNetwork();
    // Sin cuenta de operación en el nodo federal de prueba: ninguna otra función entra.
    expect((await request(network.federal, 'iffeInvestigator')).status).toBe(403);
    expect((await request(network.queretaro, 'queretaroIntake')).status).toBe(403);
  });

  it('revisa, firma con la llave del nodo y la SESNA la aceptaría', async () => {
    const network = createTestNetwork();
    const view = CompetenceViewSchema.parse(
      await (await request(network.queretaro, 'queretaroOperation')).json(),
    );
    const assignment: EntityAssignment = {
      entityId: 'PDN-22-7232',
      status: 'assigned',
      holder: {
        kind: 'institution',
        name: 'Órgano Interno de Control de la Fiscalía General del Estado (ficticio)',
      },
      legalBasis: 'LGRA, arts. 3, fr. XXI, y 10',
    };
    const entities = [
      ...entityAssignmentsOf(view.table).filter((item) => item.entityId !== 'PDN-22-7232'),
      assignment,
    ];
    const dry = CompetenceSaveResponseSchema.parse(
      await (
        await request(network.queretaro, 'queretaroOperation', {
          baseVersion: view.table.version,
          entities,
          dryRun: true,
        })
      ).json(),
    );
    expect(dry.proposal).toBeNull();
    expect(dry.problems).toEqual([]);
    expect(dry.version).toBe(view.table.version + 1);
    expect(dry.changes.map((item) => item.text)).toEqual([
      'Fiscalía General del Estado: de pendiente a OIC Órgano Interno de Control de la Fiscalía General del Estado (ficticio) (LGRA, arts. 3, fr. XXI, y 10).'.replace(
        ' (LGRA, arts. 3, fr. XXI, y 10)',
        '',
      ),
    ]);
    const signed = CompetenceSaveResponseSchema.parse(
      await (
        await request(network.queretaro, 'queretaroOperation', {
          baseVersion: view.table.version,
          entities,
          dryRun: false,
        })
      ).json(),
    );
    const proposal = signed.proposal;
    if (proposal === null) throw new Error('Se esperaba la versión firmada.');
    const node = network.signed.directory.nodes.find((item) => item.id === 'node.queretaro');
    if (node === undefined) throw new Error('Falta el nodo.');
    expect(verifyFunctionTableSignature(proposal.signedTable, node)).toBe(true);
    expect(proposal.signedTable.table.version).toBe(view.table.version + 1);
    // La misma revisión que hace la SESNA al aceptarla: el directorio con la tabla nueva.
    const others = (network.signed.directory.functionTables ?? []).filter(
      (item) => item.table.nodeId !== 'node.queretaro',
    );
    expect(
      functionTableProblems({
        ...network.signed.directory,
        functionTables: [...others, proposal.signedTable],
      }),
    ).toEqual([]);
    // Queda en el historial del panel.
    const after = CompetenceViewSchema.parse(
      await (await request(network.queretaro, 'queretaroOperation')).json(),
    );
    expect(after.proposals.map((item) => item.version)).toEqual([view.table.version + 1]);
    expect(after.proposals[0]?.signedBy).toBe('acct-00000000000000e9');
  });

  it('no firma una competencia ilegal, una versión vieja ni un ente de otra entidad', async () => {
    const network = createTestNetwork();
    const view = CompetenceViewSchema.parse(
      await (await request(network.queretaro, 'queretaroOperation')).json(),
    );
    const base = entityAssignmentsOf(view.table);
    // El OIC de un municipio no puede ser la autoridad receptora (no investiga).
    const wrong = CompetenceSaveResponseSchema.parse(
      await (
        await request(network.queretaro, 'queretaroOperation', {
          baseVersion: view.table.version,
          entities: [
            ...base,
            {
              entityId: 'PDN-22-7267',
              status: 'assigned',
              holder: { kind: 'authority', authorityId: 'authority.buzon-queretaro' },
            },
          ],
          dryRun: false,
        })
      ).json(),
    );
    expect(wrong.proposal).toBeNull();
    expect(wrong.problems.join(' ')).toContain('no tiene el papel investigating');
    const unchanged = CompetenceSaveResponseSchema.parse(
      await (
        await request(network.queretaro, 'queretaroOperation', {
          baseVersion: view.table.version,
          entities: [...base],
          dryRun: false,
        })
      ).json(),
    );
    expect(unchanged.problems).toEqual(['No hay cambios respecto de la versión vigente.']);
    const stale = await request(network.queretaro, 'queretaroOperation', {
      baseVersion: view.table.version + 5,
      entities: [...base],
      dryRun: true,
    });
    expect(stale.status).toBe(409);
    const foreign = await request(network.queretaro, 'queretaroOperation', {
      baseVersion: view.table.version,
      entities: [{ entityId: 'PDN-20-1', status: 'pending' }],
      dryRun: true,
    });
    expect(foreign.status).toBe(400);
  });
});
