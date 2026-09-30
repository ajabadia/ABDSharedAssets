"""Genera el contrato JSON del catalogo de patches del Akai S950.

La tabla REAL es la de ABDSharedCode, `SynthCore/S950PatchFields.h`, que es la
que consulta el importador (`S950Disk.h`) y la que gobierna los tests en C++.
Este script la lee y la vuelca a JSON, para que un panel en JavaScript pueda
pintar los mismos nombres y los mismos rangos que aplica el motor.

  python scripts/generate_s950_patch_contract.py         (o: pnpm generate:s950-contract)
  python scripts/generate_s950_patch_contract.py --check  (verifica sin escribir)

POR QUE GENERAR Y NO ESCRIBIR A MANO. Un contrato escrito a mano es una segunda
copia de la tabla, y las copias se separan sin ruido: alguien anade un campo al
motor, el panel sigue enseñando 38, y el desfase se descubre cuando un patch
importado suena raro. El patron ya existe en este repo para las tablas de
modulacion (`generate_modulation_contracts.py --check`), y se copia porque es el
mismo problema con la misma solucion.

LO QUE NO HACE, Y POR QUE. No interpreta C++, lo PARSEA. Un parser de verdad de
C++ seria mas bonito y habria que mantenerlo; un regex sobre una tabla de
`constexpr` que solo se escribe aqui es mas honesto, porque cuando el formato de
la tabla cambie el regex dejara de encontrar filas y el script se quejara en vez
de inventar. Los dos fallos que un regex puede tener aqui estan los dos
comprobados mas abajo: cero filas, y un numero de filas que no cuadra.
"""

import json
import os
import re
import sys

# El script vive en ABDSharedAssets/scripts/, asi que la raiz del monorepo es su
# carpeta hermana y el catalogo se lee de ahi, no de este repo.
HERE = os.path.dirname(os.path.abspath(__file__))
SHARED_ASSETS = os.path.dirname(HERE)
ROOT = os.path.dirname(SHARED_ASSETS)

# La fuente de verdad. Si este path cambia, el contrato deja de generarse y el
# --check lo dice; que es mejor que un contrato que se queda viejo en silencio.
SOURCE = os.path.join(ROOT, 'ABDSharedCode', 'SynthCore', 'S950PatchFields.h')
OUT = os.path.join(SHARED_ASSETS, 'contracts', 's950_patch_fields.json')
SCHEMA = os.path.join(SHARED_ASSETS, 'contracts', 's950-patch-fields.schema.json')

# Las filas que el contrato DEBE tener. El 38 no es un numero redondo: es el
# numero de campos que tiene un keygroup del S950, y esta en los tests de C++
# igual que aqui. Si el codigo y este numero discrepan, gana el codigo y este
# script avisa, porque el que tiene que cambiar es el numero.
EXPECTED_FIELDS = 38
EXPECTED_TRIMS = 18
EXPECTED_PORTS = 11


# ── El parser ─────────────────────────────────────────────────────────────

def read(path):
    with open(path, 'r', encoding='utf-8') as fh:
        return fh.read()


def strip_comments(text):
    """Quita los comentarios de bloque y de linea.

    Sin esto, un comentario quementione algo parecido a una fila de la tabla se
    leeria como fila. Pasó una vez con una tabla de destinos que tenia un
    ejemplo en un comentario, y el contrato salia con una fila de mas."""
    text = re.sub(r'/\*.*?\*/', ' ', text, flags=re.S)
    text = re.sub(r'//[^\n]*', ' ', text)
    return text


def table_body(source, name):
    """El cuerpo de `inline constexpr <tipo> <name>[] = { ... };`.

    Devuelve el texto entre llaves, o None si la tabla no aparece. La llave de
    cierre se busca por CONTEO y no por el primer `};` que haya, porque dentro
    de una fila hay un `};` (el de un enum) y pararse ahi daria media tabla."""
    m = re.search(r'inline\s+constexpr\s+\w+\s+' + re.escape(name) + r'\s*\[\s*\]\s*=\s*\{', source)
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
        raise ValueError('la tabla %s no cierra sus llaves' % name)

    return source[start:i - 1]


def split_rows(body):
    """Las filas `{ ... }` de una tabla, una por lista.

    Se trocea por profundidad de llaves y no por comas, porque una fila tiene
    comas dentro (`"a, b"`) y una coma no es un fin de fila."""
    rows = []
    depth = 0
    current = []
    in_string = False
    escape = False

    for ch in body:
        if escape:
            current.append(ch)
            escape = False
            continue

        if ch == '\\':
            current.append(ch)
            escape = True
            continue

        if ch == '"':
            in_string = not in_string
            current.append(ch)
            continue

        if not in_string:
            if ch == '{':
                depth += 1
                if depth == 1:
                    current = []
                    continue
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    rows.append(''.join(current))
                    current = []
                    continue
            elif ch == ',' and depth == 1:
                current.append(ch)
                continue

        current.append(ch)

    return [r.strip() for r in rows if r.strip()]


STRING_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')
# Los literales de C++ no son los de JSON: `0x08` es hexadecimal, `1.0f` lleva
# una letra de sufijo, y `29u` la lleva tambien. Sin esto las mascaras de bit y
# las ganancias de salida salen como CADENA ("0x08", "1.0f") y un panel que
# multiplicara por ellas daria NaN sin quejarse.
NUMBER_RE = re.compile(r'^-?(0[xX][0-9a-fA-F]+|\d+)[uUlL]*$')
FLOAT_RE = re.compile(r'^-?(\d+\.\d*|\.\d+|\d+)[fFlL]*$')


def parse_row(row):
    """Una fila `{ a, b, "c", 1, 2 }` -> [a, 2, "c", 1, 2] con los strings
    citados y los enteros convertidos.

    Los tokens se separan por coma FUERA de comillas, que es lo unico que hace
    falta para esta forma de escribir la tabla."""
    tokens = []
    current = ''
    in_string = False
    escape = False

    for ch in row:
        if escape:
            current += ch
            escape = False
            continue

        if ch == '\\' and in_string:
            current += ch
            escape = True
            continue

        if ch == '"':
            in_string = not in_string
            current += ch
            continue

        if ch == ',' and not in_string:
            tokens.append(current.strip())
            current = ''
            continue

        current += ch

    if current.strip():
        tokens.append(current.strip())

    out = []
    for token in tokens:
        m = STRING_RE.fullmatch(token)
        if m:
            out.append(m.group(1).replace('\\"', '"').replace('\\\\', '\\'))
            continue

        if NUMBER_RE.match(token):
            out.append(int(token.rstrip('uUlL'), 0))
            continue

        if FLOAT_RE.match(token):
            out.append(float(token.rstrip('fFlL')))
            continue

        # Un identificador: el enum de la codificacion o un `true`/`false`.
        out.append(token)

    return out


def parse_enum_literal(token, enum_name, values):
    """`PatchField::Encoding::Signed` -> 'Signed'. Falla si el valor no es uno de
    los que el enum declara, porque un token raro aqui seria un campo con una
    codificacion que el contrato no puede representar."""
    if not token.startswith(enum_name + '::'):
        return token

    short = token[len(enum_name) + 2:]
    if short not in values:
        raise ValueError('codificacion "%s" que no esta en %s' % (short, enum_name))

    return short


def parse_fields(source):
    body = table_body(source, 'patchFields')
    if body is None:
        return None

    fields = []
    for row in split_rows(body):
        t = parse_row(row)
        if len(t) < 9:
            raise ValueError('fila de campo con %d columnas, se esperaban 9: %s' % (len(t), row))

        fields.append({
            'code': t[0],
            'name': t[1],
            'byteOffset': t[2],
            'lo': t[3],
            'hi': t[4],
            'encoding': parse_enum_literal(t[5], 'PatchField::Encoding',
                                           ('Unsigned', 'Signed', 'Port', 'Bit')),
            'bitMask': t[6],
            'group': t[7],
            'trimId': t[8],
            'unit': t[9] if len(t) > 9 else '',
        })

    return fields


def parse_trims(source):
    body = table_body(source, 'performTrims')
    if body is None:
        return None

    trims = []
    for row in split_rows(body):
        t = parse_row(row)
        if len(t) < 7:
            raise ValueError('fila de trim con %d columnas, se esperaban 7: %s' % (len(t), row))

        trims.append({
            'code': t[0],
            'name': t[1],
            'fieldCode': t[2],
            'lo': t[3],
            'hi': t[4],
            'bipolar': t[5] == 'true',
            'unit': t[6],
        })

    return trims


def parse_ports(source):
    body = table_body(source, 'outputPorts')
    if body is None:
        return None

    ports = []
    for row in split_rows(body):
        t = parse_row(row)
        if len(t) < 4:
            raise ValueError('fila de puerto con %d columnas, se esperaban 4: %s' % (len(t), row))

        name = t[1]
        # El `name` va TAL CUAL lo pone la maquina —"ALL", "MONO1"— y el `code`
        # es la clave estable que usa un patch. La tipografia ("Mono 1" con
        # espacio y mayusculas) la pone quien pinta, no el contrato: un contrato
        # que maqueta se queda viejo el dia que el panel cambie su estilo, y
        # entonces el desfase parece del panel cuando es del dato.
        mono = re.fullmatch(r'MONO(\d+)', name)
        ports.append({
            'panelValue': t[0],
            'code': 'mono%d' % int(mono.group(1)) if mono else name.lower(),
            'name': name,
            'left': t[2],
            'right': t[3],
        })

    return ports


CONST_RE = re.compile(
    r'inline\s+constexpr\s+(?:std::uint8_t|int|double)\s+(\w+)\s*=\s*([^;]+);')


def parse_geometry(source):
    """Las constantes `constexpr` sueltas: la geometria del registro.

    Se cogen todas las del fichero y se filtran por un NOMBRE, en vez de
    escribirlas una por una. Una constante que se anada al C++ y no este en la
    lista sale del contrato sin avisar, y por eso la lista es explicita."""
    wanted = [
        'keygroupRecordSize', 'programHeaderSize', 'keygroupZoneStride',
        'keygroupNameOffset', 'keygroupNameSize', 'keygroupChainOffset',
        'keygroupVelocityCount', 'keygroupMaxZones', 'keygroupMaxCount',
        'keygroupCountOffset', 'programNumberOffset', 'fileNameSize',
        'keygroupFlagsByte', 'knownFlagsMask', 'reservedBitMask',
    ]

    found = {}
    for m in CONST_RE.finditer(source):
        name = m.group(1)
        if name not in wanted:
            continue

        raw = m.group(2).strip().rstrip('u').rstrip('U')
        try:
            found[name] = int(raw, 0)
        except ValueError:
            found[name] = raw

    missing = [n for n in wanted if n not in found]
    if missing:
        raise ValueError('faltan constantes de geometria en el catalogo: %s' % ', '.join(missing))

    return {k: found[k] for k in wanted}


# ── El contrato ───────────────────────────────────────────────────────────

def build(source_path=SOURCE):
    if not os.path.exists(source_path):
        raise SystemExit('no existe el catalogo de origen: %s' % source_path)

    raw = read(source_path)
    source = strip_comments(raw)

    fields = parse_fields(source)
    trims = parse_trims(source)
    ports = parse_ports(source)
    geometry = parse_geometry(source)

    # Un parser que deja de entender el codigo se vacia, y un contrato vacio
    # escrito encima del commiteado parece un cambio de datos. Cero filas es un
    # fallo del script, no un dato: no se escribe nada.
    vacios = [nombre for nombre, filas in (('patchFields', fields),
                                           ('performTrims', trims),
                                           ('outputPorts', ports))
              if not filas]

    if vacios:
        raise SystemExit(
            'VACIO %s: el catalogo no ha dado ni una fila. No se escribe nada; el '
            'contrato commiteado se queda como estaba.\nEl parser ha dejado de '
            'reconocer el codigo: mira SynthCore/S950PatchFields.h antes de regenerar.'
            % ', '.join(vacios))

    # Y que el numero de filas sea el que dicen los tests de C++. Un campo nuevo
    # tiene que subir aqui Y en el test de C++, no solo en una de las dos.
    if len(fields) != EXPECTED_FIELDS:
        raise SystemExit(
            'el catalogo tiene %d campos y este script espera %d. Se han anadido o '
            'quitado filas en SynthCore/S950PatchFields.h: actualiza EXPECTED_FIELDS '
            'aqui Y el contador en SynthCoreTests.cpp, o el contrato y el motor '
            'dejaran de hablar el mismo idioma.' % (len(fields), EXPECTED_FIELDS))

    if len(trims) != EXPECTED_TRIMS:
        raise SystemExit('el catalogo tiene %d trims y este script espera %d'
                         % (len(trims), EXPECTED_TRIMS))

    if len(ports) != EXPECTED_PORTS:
        raise SystemExit('el catalogo tiene %d salidas y este script espera %d'
                         % (len(ports), EXPECTED_PORTS))

    return {
        '$schema': './s950-patch-fields.schema.json',
        'id': 's950-patch-fields',
        'title': 'Catalogo de patches del Akai S950',
        'description': (
            'Los 38 campos de un keygroup del S950 y los 18 trims de Perform, con su '
            'byte, su rango de panel, como se codifica el byte y el nombre que ve la '
            'persona. GENERADO desde SynthCore/S950PatchFields.h, que es la fuente '
            'autoritativa y la que consulta el importador. Editar el C++ y regenerar; '
            'editar este fichero a mano es un cambio que se pierde en el siguiente '
            'generate.'),
        'generatedFrom': os.path.relpath(source_path, ROOT).replace('\\', '/'),
        'sourceOfTruth': 'ABDSharedCode/SynthCore/S950PatchFields.h',
        'encodingNotes': [
            'Unsigned: el byte tal cual.',
            'Signed: complemento a dos de 8 bits. El byte 0x80 es -128, no 128.',
            'Port: el panel 0..10 se guarda UNO MENOS, y el 0xFF del disco es el 0 '
            'del panel ("todos"). Leido como uint8 seria 255, que no es una salida.',
            'Bit: un bit suelto. Los cuatro flags comparten el byte 18, asi que '
            'cambiar uno es lectura-modificacion-escritura del byte, no escribirlo '
            'entero: si no, se pierden los otros tres y el bit reservado 0x02.',
        ],
        'rangeNotes': [
            'El 0..99 es lo que IMPRIME el panel, no lo que se guarda. '
            'softFine y loudFine van 0..255 porque son el byte bajo de un offset de '
            'altura de 16 bits con signo, en dieciseiseavos de semitono; recortarlos '
            'a 99 es un cuarto de tono de error que no da ningun fallo.',
            'velocitySwitch va 1..128, y el 128 significa "no hay segunda zona": una '
            'velocidad MIDI llega a 127, asi que ese valor puede ser ese y solo ese.',
            'lfoAftertouch y lfoModwheel van 0..50, que es donde llega la maquina.',
            'Un trim no tiene por que alcanzar los dos extremos del campo que mueve. '
            'vcfAmount lleva +-50 sobre un campo que recorre 100, y es una decision '
            'medida: el amount es el mismo valor en todos los keygroups de todos los '
            'programas, asi que no hay reparto que un offset tenga que preservar.',
        ],
        'geometry': geometry,
        'fields': fields,
        'performTrims': trims,
        'outputPorts': ports,
    }


def render(contract):
    return json.dumps(contract, indent=2, ensure_ascii=False) + '\n'


def main():
    check_only = '--check' in sys.argv[1:]

    try:
        contract = build()
    except SystemExit as exc:
        # ── UN GENERADOR QUE NO LLEGO A PRODUCIR UN CONTRATO, SALIDA 2 ──
        #
        # Todo lo que `build` aborta es de la misma clase: el origen no esta, o
        # esta y el parser no lo entiende. En ninguno de los dos casos se ha
        # mirado el json de contracts/, asi que NO se puede decir que este
        # desfasado: no se ha llegado a compararlo con nada.
        #
        # La distincion es la que separa "regenera" de "arregla el origen". Con
        # un 1 aqui el mensaje era "desfasado, se regenera con pnpm
        # generate:s950-contract", y esa orden no puede cumplirse: el generador
        # es justamente lo que esta roto, y el fichero que falta no lo genera
        # este script. Quien lo leia iba al sitio equivocado dos veces.
        print(str(exc), file=sys.stderr)
        return 2
    except ValueError as exc:
        print('error al leer el catalogo: %s' % exc, file=sys.stderr)
        return 2

    expected = render(contract)
    path = OUT

    if check_only:
        if not os.path.exists(path):
            print('DESFASADO %s: no existe' % os.path.basename(path))
            print('El generador no encuentra el contrato commiteado. Se genera con: '
                  'pnpm generate:s950-contract')
            return 1

        with open(path, 'r', encoding='utf-8') as fh:
            actual = fh.read()

        if actual != expected:
            print('DESFASADO %s' % os.path.basename(path))
            print('El catalogo de ABDSharedCode ha cambiado y el contrato no se ha '
                  'regenerado. Un panel en JavaScript esta enseñando lo viejo. Se '
                  'regenera con: pnpm generate:s950-contract')
            return 1

        print('al dia   %-32s %d campos, %d trims, %d salidas' % (
            os.path.basename(path), len(contract['fields']),
            len(contract['performTrims']), len(contract['outputPorts'])))
        return 0

    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(expected)

    print('escrito %-32s %d campos, %d trims, %d salidas' % (
        os.path.basename(path), len(contract['fields']),
        len(contract['performTrims']), len(contract['outputPorts'])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
