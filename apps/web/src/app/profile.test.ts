// Pruebas de los perfiles de la web: qué pantallas sirve la ventanilla única, el nodo de un estado
// (solo el panel) y el perfil completo de un solo nodo, y la dirección de la ventanilla.
import { describe, expect, it } from 'vitest';
import { readVentanillaUrl, readWebProfile } from '../config/app-config.ts';
import { PATHS } from './paths.ts';
import { routeAvailability } from './profile.ts';

const PUBLIC_PATHS = [
  PATHS.home,
  PATHS.report,
  PATHS.tracking,
  PATHS.verify,
  PATHS.observatory,
  PATHS.openData,
  PATHS.protection,
  PATHS.registration,
  PATHS.whoHandles,
];

describe('perfiles de la web', () => {
  it('el perfil completo (un solo nodo, pruebas y E2E) sirve todas las pantallas', () => {
    for (const path of [...PUBLIC_PATHS, PATHS.authority]) {
      expect(routeAvailability('completo', path)).toBe('page');
    }
  });

  it('la ventanilla sirve lo público y en el panel dice que está en el nodo de cada estado', () => {
    for (const path of PUBLIC_PATHS) expect(routeAvailability('ventanilla', path)).toBe('page');
    expect(routeAvailability('ventanilla', PATHS.authority)).toBe('panel-notice');
  });

  it('el nodo de un estado sirve solo el panel; lo público remite a la ventanilla', () => {
    expect(routeAvailability('panel', PATHS.authority)).toBe('page');
    for (const path of PUBLIC_PATHS) {
      expect(routeAvailability('panel', path)).toBe('ventanilla-notice');
    }
  });

  it('lee el perfil y la dirección de la ventanilla con valores seguros', () => {
    expect(readWebProfile(undefined)).toBe('completo');
    expect(readWebProfile('panel')).toBe('panel');
    expect(readWebProfile('ventanilla')).toBe('ventanilla');
    expect(readWebProfile('otro')).toBe('completo');
    expect(readVentanillaUrl('http://127.0.0.1:8790/algo')).toBe('http://127.0.0.1:8790');
    expect(readVentanillaUrl('https://denuncias.example')).toBe('https://denuncias.example');
    // Fuera de este equipo, solo https.
    expect(readVentanillaUrl('http://denuncias.example')).toBeNull();
    expect(readVentanillaUrl('javascript:alert(1)')).toBeNull();
    expect(readVentanillaUrl('')).toBeNull();
  });
});
