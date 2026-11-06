#!/usr/bin/env python3
# Comando único del proceso de datos de la PDN: python3 datos/proceso/ejecutar.py --entrada ... --salida datos/
# Lee PDN_S1.zip, PDN_S2.zip, PDN_S3v2.zip y PDN_S6.zip en streaming y escribe solo agregados en --salida.
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pdn.pipeline import Options, run  # noqa: E402


def parse_arguments(argv: list[str]) -> Options:
    parser = argparse.ArgumentParser(
        description='Convierte las descargas masivas de la PDN en productos agregados y seguros.'
    )
    parser.add_argument('--entrada', required=True, help='Carpeta con PDN_S1.zip, PDN_S2.zip, PDN_S3v2.zip y PDN_S6.zip')
    parser.add_argument('--salida', required=True, help='Carpeta de productos agregados (por ejemplo, datos/)')
    parser.add_argument(
        '--privado',
        help='Carpeta FUERA del repositorio para las salidas a nivel de registro (S3 y S6 en SQLite)',
    )
    parser.add_argument('--procesos', type=int, default=min(8, os.cpu_count() or 2), help='Procesos en paralelo')
    parser.add_argument('--fecha-referencia', help='Fecha AAAA-MM-DD de la descarga (por omisión, la de <salida>/fuentes.json o, si no existe, la de los ZIP)')
    parser.add_argument('--sin-sha', action='store_true', help='No calcula el sha256 de las descargas')
    arguments = parser.parse_args(argv)
    return Options(
        input_dir=os.path.abspath(arguments.entrada),
        output_dir=os.path.abspath(arguments.salida),
        private_dir=os.path.abspath(arguments.privado) if arguments.privado else None,
        processes=max(1, arguments.procesos),
        reference=arguments.fecha_referencia,
        verify_sha=not arguments.sin_sha,
    )


def main(argv: list[str]) -> int:
    options = parse_arguments(argv)
    try:
        report = run(options)
    except (FileNotFoundError, ValueError) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
