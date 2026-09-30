"""Genera el contrato JSON de las curvas de calibracion del Akai S950.

La tabla REAL es la de ABDSharedCode, `SynthCore/S950Calibration.h`, que es la que
consulta el motor. Este script la lee y la vuelca a JSON para que un panel pueda
dibujar los EJES de cada curva —su unidad, si su escala es logaritmica, que rango
de panel cubre— y marcar cuales siguen SIN MEDIR.

  python scripts/generate_s950_calibration_contract.py         (o: pnpm generate:s950-cal)
  python scripts/generate_s950_calibration_contract.py --check  (verifica sin escribir)

  `--source RUTA` lee otra tabla. Existe para los tests: los tres caminos de
  fallo de este generador —cero curvas, filas que no cuadran, una columna nueva
  en `CalCurveInfo`— no se pueden provocar con la tabla buena, y un generador
  probado solo con el caso bueno es un generador probado una vez.

LO QUE ESTE CONTRATO TIENE Y NO TIENE, Y POR QUE LA DIFERENCIA ES EL PUNTO.

Se declara la FORMA de cada curva —que curva existe, en que unidad, sobre que
rango de panel, si sube con el byte— y eso sale del dominio del panel
(`S950PatchFields.h`), que ya esta probado. NO se declara ningun valor medido, y
no es un TODO: los puntos son RESULTADOS EXPERIMENTALES, y la tabla del estudio
Mz950 que los tiene es AGPLv3.

Por eso el contrato lleva un `"measured": false` y un `"points": []` EXPLICITOS, y
un `"measuredRange": null`. Un panel tiene que poder ENSENAR que no lo sabe, y
enseñarlo exige que el dato sea distinguible de un cero: 0 s de attack no es "no
medido", es un CLICK. Por eso `measuredRange` es `null` y no `0..99`.

PARTE DE LO QUE ESTE GENERADOR PUEDE Y NO PUEDE LEER. Los puntos medidos viven en
un `std::vector` que se llena en runtime (`addPoint`), no en la tabla `constexpr`,
asi que de la tabla solo se puede leer la FORMA. El generador no intenta
inventar los puntos: emite cero, que es exactamente lo que el C++ compila.

POR QUE GENERAR Y NO ESCRIBIR A MANO. Igual que el catalogo de patches: un
contrato escrito a mano es una segunda copia, y las copias se separan sin ruido.
Aqui el dano seria peor: alguien anade una septima curva al motor, el panel sigue
dibujando seis ejes, y un ataque se dibuja con la escala de otro.
"""

import json
import os
import re
import sys

# Los lectores de tabla de C++ son GENERICOS, y ya estan escritos y probados en
# el generador del catalogo de patches. Copiarlos seria una tercera version de
# la misma cosa que se separaria de las otras dos; importarlos es lo que obliga a
# que las dos compartan el mismo parser.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_s950_patch_contract as table_reader  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED_ASSETS = os.path.dirname(HERE)
ROOT = os.path.dirname(SHARED_ASSETS)

SOURCE = os.path.join(ROOT, 'ABDSharedCode', 'SynthCore', 'S950Calibration.h')
OUT = os.path.join(SHARED_ASSETS, 'contracts', 's950_calibration.json')
SCHEMA = os.path.join(SHARED_ASSETS, 'contracts', 's950-calibration.schema.json')

# Las curvas que el contrato DEBE tener. El 6 no es un numero redondo: son las
# seis curvas que declara `S950Calibration.h`, y esta en los tests de C++ igual
# que aqui. Si el codigo y este numero discrepan, gana el codigo y este script
# avisa, porque el que tiene que cambiar es el numero.
EXPECTED_CURVES = 6

# El nombre del enum que identifica cada curva. Va aqui y no se deduce del
# nombre de la tabla porque un parser que adivina es un parser que un dia
# adivina mal: el `count` final del enum NO es una curva, y por eso la lista de
# ids es explicita en vez de "todo lo que hay antes de count".
ENUM_NAME = 'CalCurveId'

# Las once columnas de una fila de `CalCurveInfo`, en el orden en que estan
# escritas. Escribir el numero a mano en vez de `len()` es lo que hace que una
# columna nueva en el C++ haga fallar el generador en vez de salir con un
# `null` en el JSON.
COLUMNS = (
    'id', 'code', 'name', 'unit', 'axisLabel',
    'storedLo', 'storedHi',
    'risesWithStored', 'logarithmic', 'positiveOnly', 'allowExtrapolation',
)

BOOL_RE = re.compile(r'^(true|false)$')


def parse_enum_ids(source):
    """Los valores de `enum class CalCurveId { ... };`, en orden, sin el `count`.

    Se busca el `enum class` POR NOMBRE y no 'el primer enum del fichero': el
    primer enum es un detalle de donde se mire, y ese detalle cambia con una
    refactorizacion que no tiene nada que ver con la calibracion.
    """
    m = re.search(r'enum\s+class\s+' + ENUM_NAME + r'\s*\{', source)
    if m is None:
        return None

    start = m.end()
    depth = 1
    i = start
    while i < len(source) and depth > 0:
        if source[i] == '{':
            depth += 1
        elif source[i] == '}':
            depth -= 1
        i += 1

    if depth != 0:
        raise ValueError('el enum %s no cierra sus llaves' % ENUM_NAME)

    body = source[start:i - 1]

    ids = []
    for raw in body.split(','):
        token = raw.strip()
        if not token:
            continue
        if not re.fullmatch(r'[A-Za-z_]\w*', token):
            raise ValueError('el enum %s declara algo que no es un identificador: %r' % (ENUM_NAME, token))
        # `count` es el centinela que dimensiona el array de puntos, no una curva.
        if token == 'count':
            continue
        ids.append(token)

    return ids


def parse_curves(source, ids):
    body = table_reader.table_body(source, 'calibrationCurves')
    if body is None:
        return None

    curves = []
    for row in table_reader.split_rows(body):
        t = table_reader.parse_row(row)

        if len(t) != len(COLUMNS):
            raise ValueError(
                'fila de curva con %d columnas, se esperaban %d: %s\n'
                'Se ha anadido o quitado una columna en CalCurveInfo: la lista COLUMNS '
                'de este script tiene que cambiar con ella.'
                % (len(t), len(COLUMNS), row))

        if not t[0].startswith(ENUM_NAME + '::'):
            raise ValueError('la curva %r no dice de que enum es' % t[0])

        short = t[0][len(ENUM_NAME) + 2:]
        if short not in ids:
            raise ValueError('la curva usa el id %r, que %s no declara' % (short, ENUM_NAME))

        for column, value in zip(COLUMNS[7:], t[7:]):
            # El `isinstance` va ANTES del regex y no por gusto: `parse_row`
            # devuelve los numeros ya convertidos, asi que un `1` escrito donde
            # va un booleano llegaba aqui como `int` y `BOOL_RE.match(1)`
            # reventaba con un TypeError. Un traceback de Python no dice qué
            # columna está mal, y el trabajo de este generador es precisamente
            # decirlo: un fallo de contrato que se lee como un fallo del script
            # es un fallo que nadie arregla.
            if not isinstance(value, str) or not BOOL_RE.match(value):
                raise ValueError('la columna %s de %r es %r, y tiene que ser true o false'
                                 % (column, t[1], value))

        curves.append({
            'code': t[1],
            'name': t[2],
            'unit': t[3],
            'axisLabel': t[4],
            'storedLo': t[5],
            'storedHi': t[6],
            'risesWithStored': t[7] == 'true',
            'logarithmic': t[8] == 'true',
            'positiveOnly': t[9] == 'true',
            'allowExtrapolation': t[10] == 'true',

            # Y ahora lo que NO hay, dicho de forma que un panel lo pueda pintar.
            'measured': False,
            'pointCount': 0,
            'points': [],
            'measuredRange': None,
        })

    # El orden de la tabla y el orden del enum tienen que ser el MISMO, porque
    # `S950Calibration` indexa los puntos con `static_cast<int>(id)`. Si se
    # separaran, la curva dibujada con los puntos de otra no daria ningun fallo
    # en C++ —el indice es valido— y solo sonaria mal.
    #
    # Se DEVUELVE en vez de comprobarse aqui, y el motivo es el orden de los
    # avisos: una septima fila hace que las dos listas sean distintas, y este
    # script avisaba de "la tabla declara 7 y el enum 6" o de "las listas no
    # coinciden" segun cual se mirase antes. El segundo es cierto y no dice
    # nada: no dice SI sobra o si falta. Lo comprueba `build()`, DESPUES del
    # aviso de `EXPECTED_CURVES`, que es el que si da el numero.
    por_id = []
    for row in table_reader.split_rows(table_reader.table_body(source, 'calibrationCurves')):
        t = table_reader.parse_row(row)
        por_id.append(t[0][len(ENUM_NAME) + 2:])

    return curves, por_id


def build(source_path=SOURCE):
    if not os.path.exists(source_path):
        raise SystemExit('no existe la calibracion de origen: %s' % source_path)

    with open(source_path, 'r', encoding='utf-8') as fh:
        raw = fh.read()

    source = table_reader.strip_comments(raw)

    ids = parse_enum_ids(source)

    # `parse_curves` devuelve None cuando la tabla no esta, y eso NO es lo mismo
    # que devolver una lista vacia: lo primero es que la tabla se ha ido de este
    # fichero, lo segundo es que no tiene filas. Las dos cosas tienen que acabar
    # en el mismo aviso de VACIO, asi que el None se convierte aqui en lista
    # vacia y se deja que lo de abajo lo diga —en vez de que reviente al
    # desempaquetar una tupla que no existe—.
    parsed = parse_curves(source, ids or [])
    curves, por_id = parsed if parsed is not None else ([], [])

    # Un parser que deja de entender el codigo se vacia, y un contrato vacio
    # escrito encima del commiteado parece un cambio de datos. Cero curvas es un
    # fallo del script, no un dato.
    if not curves:
        raise SystemExit(
            'VACIO: S950Calibration.h no ha dado ni una curva. No se escribe nada; el '
            'contrato commiteado se queda como estaba.\nEl parser ha dejado de reconocer '
            'el codigo: mira SynthCore/S950Calibration.h antes de regenerar.')

    if len(curves) != EXPECTED_CURVES:
        raise SystemExit(
            'la calibracion declara %d curvas y este script espera %d. Se han anadido o '
            'quitado filas en SynthCore/S950Calibration.h: actualiza EXPECTED_CURVES aqui '
            'Y el contador en SynthCoreTests.cpp.' % (len(curves), EXPECTED_CURVES))

    codigos = [c['code'] for c in curves]
    if len(set(codigos)) != len(codigos):
        raise SystemExit('hay codigos de curva repetidos: %s' % ', '.join(codigos))

    # Y el ORDEN, que es el fallo silencioso: el motor indexa los puntos con
    # `static_cast<int>(id)`, asi que una tabla reordenada no da ningun error en
    # C++ —el indice es valido— y lo unico que pasa es que cada curva dibuja los
    # puntos de otra. Va DESPUES del aviso de `EXPECTED_CURVES` a proposito: si
    # sobran o faltan filas, ese aviso ya ha dicho cuantas, y este solo repetiria
    # dos listas largas sin decir cual de las dos cosas pasó.
    if por_id != ids:
        raise SystemExit(
            'ORDEN: la tabla de SynthCore/S950Calibration.h declara %s y el enum %s declara '
            '%s. El array de puntos se indexa con el entero del enum, asi que una curva '
            'dibujaria los puntos de otra sin dar ningun fallo.'
            % (', '.join(por_id), ENUM_NAME, ', '.join(ids)))

    return {
        '$schema': './s950-calibration.schema.json',
        'id': 's950-calibration',
        'title': 'Curvas de unidades del Akai S950',
        'description': (
            'Las seis curvas que relacionan un valor de panel con su unidad real '
            '(segundos, Hz, octavas, dB), con la forma de cada eje. GENERADO desde '
            'SynthCore/S950Calibration.h, que es la fuente autoritativa. Los PUNTOS '
            'salen vacios y por decision: son resultados experimentales, y la tabla del '
            'estudio Mz950 que los tiene es AGPLv3. Un panel dibuja los ejes con esto y '
            'marca las curvas sin medir; no las inventa.'),
        'generatedFrom': os.path.relpath(source_path, ROOT).replace('\\', '/'),
        'sourceOfTruth': 'ABDSharedCode/SynthCore/S950Calibration.h',
        'notes': [
            'ESTE CONTRATO NO TIENE UN SOLO VALOR MEDIDO, y no es que falten: es la '
            'respuesta correcta a "todavia nadie ha medido esto en este repo". Lo que se '
            'declara es la FORMA, que sale del dominio del panel y es dato de formato; '
            'los puntos son una medicion, y medir es cosa de quien tenga la maquina.',
            '"measured": false y "points": [] estan EXPLICITOS, y "measuredRange" es null '
            'y no 0..99. Un panel tiene que poder ENSENAR que no lo sabe, y enseñarlo '
            'exige que "no lo se" sea distinguible de un cero: 0 s de attack no es lo '
            'mismo que un attack sin medir, es un click.',
            'Los puntos medidos viven en un vector que se llena en runtime, no en la '
            'tabla constexpr, asi que el generador no puede leerlos ni aunque quisiera. '
            'Cuando se midan, la tabla deja de ser la fuente y pasa a serlo el fichero '
            'de medicion; ese cambio tiene que actualizar generatedFrom.',
            'positiveOnly NO es lo mismo que logarithmic, aunque las dos se escriban '
            'juntas en la tabla. Los dB tienen eje logaritmico y admiten el 0 —0 dB es el '
            'nivel de referencia, no un instante— y el silencio de un sustain apagado es '
            'un valor legitimo. Un tiempo de cero si es un instante, y una envolvente de '
            'duracion cero es un click.',
            'allowExtrapolation es false en las seis. Un extremo que nadie ha medido es el '
            'que se rellena con una conjetura: el rapido se acaba antes de que la sonda lo '
            'vea, y el lento dura mas que la nota.',
            'risesWithStored es false en las curvas de tiempo y en la de dB, porque mas '
            'byte es MAS LENTO o MAS FUERTE, no mas valor. Es lo primero que se dibuja '
            'equivocado, porque el nombre del byte no lo dice.',
        ],
        'curves': curves,
    }


def render(contract):
    return json.dumps(contract, indent=2, ensure_ascii=False) + '\n'


def main():
    check_only = '--check' in sys.argv[1:]

    # `--source` existe para lo que parece: poder EJERCITAR los fallos de este
    # generador sin tocar la tabla real. Los tres caminos que importan —cero
    # curvas, un numero de filas que no cuadra, una columna nueva en
    # `CalCurveInfo`— no se pueden provocar con la tabla buena, y un generador
    # que solo se ha probado con el caso bueno es un generador que se ha probado
    # una vez. Con esto, un test le pasa una tabla rota y comprueba que se niega
    # a escribir, y eso si es una prueba.
    source = SOURCE
    if '--source' in sys.argv:
        i = sys.argv.index('--source')
        if i + 1 >= len(sys.argv):
            print('--source necesita una ruta', file=sys.stderr)
            return 2
        source = sys.argv[i + 1]

    try:
        contract = build(source)
    except SystemExit as exc:
        # ── UN GENERADOR QUE NO LLEGO A PRODUCIR UN CONTRATO, SALIDA 2 ──
        #
        # Mismo motivo que en `generate_s950_patch_contract.py`: si `build` aborta
        # no se ha mirado el json de contracts/, asi que no se puede afirmar que
        # este desfasado. Es "no he podido comprobar", que es lo que dice el 2.
        print(str(exc), file=sys.stderr)
        return 2
    except ValueError as exc:
        print('error al leer la calibracion: %s' % exc, file=sys.stderr)
        return 2

    expected = render(contract)

    if check_only:
        if not os.path.exists(OUT):
            print('DESFASADO %s: no existe' % os.path.basename(OUT))
            print('Se genera con: pnpm generate:s950-cal')
            return 1

        with open(OUT, 'r', encoding='utf-8') as fh:
            actual = fh.read()

        if actual != expected:
            print('DESFASADO %s' % os.path.basename(OUT))
            print('SynthCore/S950Calibration.h ha cambiado y el contrato no se ha '
                  'regenerado. Un panel esta dibujando ejes viejos. Se regenera con: '
                  'pnpm generate:s950-cal')
            return 1

        print('al dia   %-32s %d curvas, %d medidas' % (
            os.path.basename(OUT), len(contract['curves']),
            sum(1 for c in contract['curves'] if c['measured'])))
        return 0

    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write(expected)

    print('escrito %-32s %d curvas, %d medidas' % (
        os.path.basename(OUT), len(contract['curves']),
        sum(1 for c in contract['curves'] if c['measured'])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
