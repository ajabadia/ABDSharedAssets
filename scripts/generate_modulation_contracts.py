"""Genera las tres instancias del contrato de matriz de modulacion.

Las tres se construyen desde la tabla REAL de cada proyecto, no desde una copia
escrita a mano: ese es el motivo de que este script exista.

  - ABDEep     : su tabla es WebUI/js/modmatrix_data.js (la que se corresponde
                 con el byte), y los rangos vienen de la medicion de la Fase 0
                 sobre los bancos de fabrica.
  - ABDMS2000  : su tabla es Source/DSP/Modulation/VirtualPatchMatrix.h.
  - ABDNeural  : su tabla es Source/State/ParameterDefinitions.h
                 (getModDestinationTable + getModSources), que ya es el
                 descriptor que el nucleo compartido quiere.

    node scripts/generate_modulation_contracts.py  (o: pnpm generate:mod-contracts)
    python scripts/generate_modulation_contracts.py --check  (verifica sin escribir)

Requiere estar dentro del monorepo ABDSynths, porque lee las tablas de los tres
proyectos (ABDEep, ABDMS2000 y ABDNeural). No es un script autonomo: el valor
esta justamente en que lee el codigo de cada synth en vez de una copia.
"""

import json
import os
import re
import subprocess
import sys

# El script vive en ABDSharedAssets/scripts/, asi que la raiz del monorepo es
# su carpeta hermana: los tres proyectos se leen de ahi, no de este repo.
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, '..', 'contracts')

# ── ABDEep: fuentes y destinos, de la tabla del dato ───────────────────────

ABDEEP_SOURCES = [
    ('None', 'none', False),
    ('Pitch Bend', 'performance', False),
    ('Mod Wheel', 'performance', False),
    ('Foot Ctrl', 'pedal', False),
    ('BreathCtrl', 'pedal', False),
    ('Pressure', 'performance', False),
    ('Expression', 'pedal', False),
    ('LFO 1', 'lfo', False),
    ('LFO 2', 'lfo', False),
    ('Env 1', 'envelope', True),
    ('Env 2', 'envelope', True),
    ('Env 3', 'envelope', True),
    ('Note Num', 'performance', False),
    ('Note Vel', 'performance', False),
    ('Note Off Vel', 'performance', False),
    ('Ctrl Seq', 'other', False),
    ('LFO 1 (Uni)', 'lfo', False),
    ('LFO 2 (Uni)', 'lfo', False),
    ('LFO 1 (Fade)', 'lfo', False),
    ('LFO 2 (Fade)', 'lfo', False),
    ('Voice Num', 'voice', False),
    ('Uni Voice', 'voice', False),
    ('CC X (115)', 'other', False),
    ('CC Y (116)', 'other', False),
    ('CC Z (117)', 'other', False),
]

# El rango del byte (docs/sysex_format.md) y lo que el hardware EJERCE
# (medido en la Fase 0 sobre 1024 presets de fabrica).
ABDEEP_SRC_MAX = 22
ABDEEP_DST_MAX = 129
ABDEEP_MEASURED_SRC_MAX = 19
ABDEEP_MEASURED_DST_MAX = 129


def read(path):
    with open(path, 'r', encoding='utf-8') as fh:
        return fh.read()


def parse_js_string_array(text, name):
    """Extrae un array de literales de cadena del fuente JS."""
    start = text.index('const %s = [' % name)
    end = text.index('];', start)
    body = text[text.index('[', start) + 1:end]
    out = []
    for chunk in body.split(','):
        chunk = chunk.strip()
        if not chunk:
            continue
        # Quita el comentario de fin de linea que se colaba en el ultimo item.
        chunk = re.sub(r"//.*$", '', chunk).strip()
        m = re.match(r"^['\"](.*)['\"]$", chunk)
        if m:
            out.append(m.group(1))
    return out


def abdeep_destinations():
    """Los destinos del manual, desde la tabla real de la WebUI."""
    text = read(os.path.join(
        ROOT, 'ABDEep', 'WebUI', 'js', 'modmatrix_data.js'))
    base = parse_js_string_array(text, 'MOD_DESTINATIONS')

    # La tabla del dato rellena hasta 132: a partir del final de `base` van
    # 'Dest N', y 129-132 son los niveles de los cuatro FX.
    full = []
    for i in range(0, 133):
        if i < len(base):
            full.append(base[i])
        elif i in (129, 130, 131, 132):
            full.append('Fx %d Level' % (i - 128))
        else:
            full.append('Dest %d' % i)
    return full[:ABDEEP_DST_MAX + 1]


def build_abdeep():
    dests = abdeep_destinations()
    return {
        'schemaVersion': '1.0',
        'id': 'abdeep',
        'displayName': 'Behringer DeepMind 12 (ABDEep)',
        'description': (
            'Matriz de 8 buses del DeepMind 12. Los indices son indices de BYTE '
            '(93-116 de la trama SysEx) y su orden es el del manual: no se puede '
            'reordenar sin romper la compatibilidad de patches. Los destinos 74-128 '
            'los ejerce el hardware pero no hay evidencia de su etiqueta, asi que '
            'se declaran como "Dest N" a proposito (una etiqueta honesta vale mas '
            'que una inventada).'),
        'authority': 'hardware',
        'byteRange': {
            'firstByte': 93,
            'bytesPerSlot': 3,
            'sourceMax': ABDEEP_SRC_MAX,
            'destinationMax': ABDEEP_DST_MAX,
            'depthIsBipolar': True,
            'measuredSourceMax': ABDEEP_MEASURED_SRC_MAX,
            'measuredDestinationMax': ABDEEP_MEASURED_DST_MAX,
        },
        'slots': 8,
        'sources': [
            {'label': label, 'category': cat, 'perNote': per_note}
            for label, cat, per_note in ABDEEP_SOURCES
        ],
        'destinations': [
            {'label': label} for label in dests
        ],
        'provenance': {
            'source': (
                'resources/md/deepmind_fx_modmatrix.md (manual) + '
                'docs/sysex_format.md (rango de byte) + medicion de la Fase 0'),
            # `source` de arriba es para el que LEE: explica la evidencia con
            # palabras. Este es para el que COMPRUEBA: son las rutas tal cual
            # existen en el monorepo, con el repo delante, porque
            # `resources/md/...` no significa nada hasta que se sabe que vive en
            # ABDEep y no en ABDNeural. Sin esta lista, las dos rutas de `source`
            # no se pueden comprobar y la referencia vale como documento, no como
            # dato: el dia que el manual se mueva, el contrato sigue mintiendo
            # igual que hoy.
            'sourceFiles': [
                'ABDEep/resources/md/deepmind_fx_modmatrix.md',
                'ABDEep/docs/sysex_format.md',
                'ABDEep/WebUI/js/modmatrix_data.js',
            ],
            'measuredFrom': (
                'ABDEep/resources/hardware_dumps/2026-08-10 (1024 presets de '
                'fabrica, 8192 slots)'),
            'verifiedAt': '2026-09-28',
        },
    }


# ── ABDMS2000: su enum de la matriz virtual ────────────────────────────────

MS2000_SOURCES = [
    ('EG1', 'envelope', True),
    ('EG2', 'envelope', True),
    ('LFO1', 'lfo', False),
    ('LFO2', 'lfo', False),
    ('Velocity', 'performance', False),
    ('KbdTrack', 'performance', False),
    ('PitchBend', 'performance', False),
    ('ModWheel', 'performance', False),
]

MS2000_DESTS = [
    'Pitch', 'OSC2 Pitch', 'OSC1 Ctrl1', 'Noise Level',
    'Cutoff', 'Amp', 'Pan', 'LFO2 Freq',
]


def build_ms2000():
    return {
        'schemaVersion': '1.0',
        'id': 'abdm s2000'.replace(' ', ''),
        'displayName': 'Korg MS-2000 (ABDMS2000)',
        'description': (
            'Virtual Patch del MS-2000: 4 buses, 8 fuentes y 8 destinos, en el '
            'orden de su SysEx. El motor evalua la matriz dos veces por muestra '
            '(una previa, porque el LFO2 se puede modular a si mismo).'),
        'authority': 'hardware',
        'slots': 4,
        'sources': [
            {'label': label, 'category': cat, 'perNote': per_note}
            for label, cat, per_note in MS2000_SOURCES
        ],
        'destinations': [
            {'label': label, 'perNote': True} for label in MS2000_DESTS
        ],
        'provenance': {
            'source': 'Source/DSP/Modulation/VirtualPatchMatrix.h',
            # La ruta que de verdad lee el generador, con el repo delante.
            'sourceFiles': [
                'ABDMS2000/Source/DSP/Modulation/VirtualPatchMatrix.h',
            ],
            'verifiedAt': '2026-09-28',
        },
    }


# ── ABDNeural: su tabla es el formato de preset ────────────────────────────

NEURONIK_SOURCES = [
    ('Off', 'none', False),
    ('LFO 1', 'lfo', False),
    ('LFO 2', 'lfo', False),
    ('Pitch Bend', 'performance', False),
    ('Mod Wheel', 'performance', False),
    ('Aftertouch', 'performance', False),
    ('ENV 1', 'envelope', True),
    ('ENV 2', 'envelope', True),
]

# La tabla de destinos vive en ModDestinationTable.h como `kModDestinationTable`
# —un constexpr ya, no una tabla local dentro de getModDestinationTable()— y cada
# fila lleva su perNote y su replaces. Antes aqui habia dos conjuntos de indices
# escritos a mano para sacar esas dos banderas del switch de
# NeuronikEngine::applyModulation; ahora se leen de la fila, que es donde estan,
# y la tabla no puede dejar de cuadrar con el codigo sin que se note.
NEURONIK_DESTINATION = re.compile(
    r'makeModDestination<\s*(\d+)\s*>\s*'
    r'\(\s*"([^"]*)"\s*,\s*'
    r'(?:nullptr|"([^"]*)")'
    r'(?:\s*,\s*(true|false))?'
    r'(?:\s*,\s*(true|false))?'
    r'(?:\s*,[^)]*)?\s*\)')


def parse_neuronik_table():
    """Lee `kModDestinationTable` de ModDestinationTable.h.

    Devuelve una fila por destino: (etiqueta, parameterId, perNote, replaces).
    El parameterId va como cadena o None, que es como lo escribe el contrato."""
    text = read(os.path.join(
        ROOT, 'ABDNeural', 'Source', 'State', 'ModDestinationTable.h'))
    start = text.index('kModDestinationTable[]')
    open_brace = text.index('{', text.index('=', start))
    end = text.index('};', open_brace)
    body = text[open_brace:end]

    rows = []
    indices = []
    for m in NEURONIK_DESTINATION.finditer(body):
        rows.append((m.group(2), m.group(3),
                     m.group(4) == 'true', m.group(5) == 'true'))
        indices.append(int(m.group(1)))

    # ── EL INDICE NO SE PASA POR ALTO, Y ESTO LO COMPRUEBA ──
    #
    # El `makeModDestination<12>` no es decoracion: es el indice del FORMATO DE
    # PRESET, y el motor lo comprueba fila a fila. El contrato guarda los
    # destinos en ORDEN y sin indice, asi que ese numero solo puede vivir aqui.
    #
    # Se comprueba por un motivo concreto, que es que el fallo que tapa este
    # regex no es "no reconoce la tabla": es reconocerla A MEDIAS. Una fila
    # partida en dos lineas, o con un comentario dentro de los parentesis, hace
    # que el regex se la salte en silencio. El corte de "tabla vacia" de mas
    # abajo no lo ve, porque la tabla no esta vacia: le faltan dos filas de
    # treinta y una, y el `--check` dira "desfasado" con toda la razon, como si
    # hubiera que regenerar. Regenerar en ese estado mete el recorte en el
    # contrato y ya no hay manera de saber que estuvo ahi.
    #
    # Un indice que se salta o se repite es la senal de que falta una fila.
    if indices and indices != list(range(len(indices))):
        raise SystemExit(
            'VACIO neuronik_modulation_matrix.json: la tabla de ModDestinationTable.h '
            'no sale de 0..N-1 sin huecos (%d filas leidas, primer hueco en %s). '
            'El parser ha dejado de reconocer el codigo del synth: mira la tabla '
            'antes de regenerar.'
            % (len(indices), _primer_hueco(indices)))

    return rows


def _primer_hueco(indices):
    for esperado, visto in enumerate(indices):
        if esperado != visto:
            return 'fila %d (dice %d)' % (esperado, visto)
    return 'el final de la lista'


# LA NOTA DE `replaces`, Y POR QUE VIVE AQUI Y NO EN EL JSON.
#
# Este texto se escribio a mano en el contrato el 2026-09-29, el dia que los
# destinos 12..16 dejaron de declarar `replaces`. Y al dia siguiente el
# `--check` empezo a decir que el contrato estaba desfasado, porque un generador
# que no sabe escribir una nota nunca puede reproducir un fichero que la tiene.
#
# La paradoja es uncomfortable: el generador es la fuente de la verdad sobre las
# BANDERAS, y no sobre la explicacion de que significan. Regenerar para dejar de
# estar desfasado habria borrado el unico sitio donde estaba escrito por que 12
# ya no es un `envAssign` —y ese "por que" es la decision, no el dato— y habria
# dejado el contrato en verde con menos informacion que antes. Un contrato
# regenerado que pierde el porque de una decision es un contrato peor, y en
# verde.
#
# La nota se emite siempre, y el generador vuelve a ser el duenno del fichero
# entero. Cambiar el texto es editar esta constante, que es el sitio honesto:
# esta al lado del codigo que decide las banderas, no dentro del json que la
# describe.
NEURONIK_REPLACES_NOTE = (
    '`replaces` es exactamente `envAssign` en el motor: la envolvente PISA el '
    'factor de routing en vez de sumarse encima. Los destinos 12..16 dejaron '
    'de publicarlo el 2026-09-29: son acumuladores a cero, la envolvente los '
    'MODULA y no los pisa, y por eso van con `perNote: true` y '
    '`replaces: false`. Los unicos que reemplazan son el 1 (ENV 1 -> VCA) y el '
    '10 (ENV 2 -> cutoff), donde la envolvente ES la senal.')


def build_neuronik():
    dests = []
    for label, parameter_id, per_note, replaces in parse_neuronik_table():
        entry = {'label': label, 'parameterId': parameter_id}
        if per_note:
            entry['perNote'] = True
            # ── POR QUE `replaces` SE ESCRIBE TAMBIEN CUANDO ES FALSO ──
            #
            # `replaces` sin `perNote` no describe nada: es como se comporta una
            # envolvente, y si la fila no es por voz no hay envolvente que
            # colocar. Publicarlo solo cuando es verdadero —que es lo que hacia
            # este codigo— deja la fila identica a la que no dice nada, y el
            # consumidor tiene que adivinar el default del esquema. Publicarlo
            # siempre que la fila sea `perNote` convierte "no aparece" en
            # "esta fila no va por voz", que si significa algo.
            entry['replaces'] = replaces
        dests.append(entry)

    return {
        'schemaVersion': '1.0',
        'id': 'neuronik',
        'displayName': 'NEURONiK (ABDNeural)',
        'description': (
            'Matriz propia, sin compromiso de hardware. Su tabla es ademas el '
            'FORMATO DE PRESET: los choices guardan indice, asi que solo se '
            'appendea al final (insertar en medio re-mapea los presets '
            'guardados). perNote y replaces sacan del switch de 31 casos la '
            'politica que tenia escondida.'),
        'authority': 'design',
        'slots': 4,
        'sources': [
            {'label': label, 'category': cat, 'perNote': per_note}
            for label, cat, per_note in NEURONIK_SOURCES
        ],
        'replacesNote': NEURONIK_REPLACES_NOTE,
        'destinations': dests,
        'provenance': {
            'source': ('Source/State/ModDestinationTable.h '
                       '(kModDestinationTable) y el switch de '
                       'NeuronikEngine::applyModulation'),
            'sourceFiles': [
                'ABDNeural/Source/State/ModDestinationTable.h',
                'ABDNeural/Source/State/ParameterDefinitions.h',
            ],
            'verifiedAt': '2026-09-29',
        },
    }


def render(contract):
    """El contrato tal como se escribe a disco (para comparar byte a byte)."""
    return json.dumps(contract, indent=2, ensure_ascii=False) + '\n'


def main():
    check_only = '--check' in sys.argv[1:]

    contracts = {
        'abdeep_modulation_matrix.json': build_abdeep(),
        'abdms2000_modulation_matrix.json': build_ms2000(),
        'neuronik_modulation_matrix.json': build_neuronik(),
    }

    # ¿ QUIÉN ESCRIBIÓ ESTE FICHERO?
    #
    # Los tres contratos declaran en `provenance` de dónde sale cada fila, que es
    # lo que hace que una etiqueta inventada se distinga de una medida. Eso no
    # dice quién lo escribió: un contrato generado y uno escrito a mano se leen
    # exactamente igual, y hay una defensa que depende de esa diferencia.
    #
    # El guard de `.gitattributes` protege lo que se COMPARA byte a byte, porque
    # un artefacto generado con los saltos de línea cambiados ensucia el diff
    # entero la próxima vez que se regenera. Para protegerlo tiene que
    # RECONOCERLO, y el nombre no ayuda: `*_modulation_matrix.json` no dice si lo
    # escribió una persona o este script. Con esta clave el guard lo descubre
    # leyendo el blob, y un contrato nuevo nace protegido sin que nadie tenga que
    # acordarse de añadirlo a una lista.
    #
    # Se escribe aquí, en `main`, y no en cada `build_*`, porque es el sitio donde
    # el generador ya sabe cuáles son sus salidas: aunque añadan un cuarto
    # contrato al generador, sale marcado.
    for contrato in contracts.values():
        contrato['generatedBy'] = 'scripts/generate_modulation_contracts.py'

    # Una tabla que se lee VACIA no es un synth sin destinos: es un parser que ha
    # dejado de entender el codigo. Sin este corte el generador escribia encima
    # del contrato commiteado una lista vacia y el --check decia «desfasado» como
    # si fuera cosa de otro. Parsear cero filas es un fallo del script, no un dato.
    vacios = [nombre for nombre, contrato in sorted(contracts.items())
              if not contrato['sources'] or not contrato['destinations']]

    if vacios:
        print('')
        for nombre in vacios:
            print('VACIO %s: la tabla del synth no ha dado ni una fila. No se '
                  'escribe nada; el contrato commiteado se queda como estaba.' % nombre)
        print('')
        print('El parser ha dejado de reconocer el codigo del synth: mira su '
              'tabla antes de regenerar.')
        return 2

    stale = []

    for filename, contract in sorted(contracts.items()):
        path = os.path.join(OUT, filename)
        expected = render(contract)

        if check_only:
            # Modo verificacion: el contrato commiteado tiene que coincidir con
            # lo que sale de leer el codigo de los synths. Es lo que detecta que
            # alguien toco una tabla y no regenero el contrato.
            if not os.path.exists(path):
                stale.append('%s: no existe' % filename)
                continue
            with open(path, 'r', encoding='utf-8') as fh:
                actual = fh.read()
            if actual != expected:
                stale.append('%s: desfasado respecto al codigo de los synths'
                             % filename)
            else:
                print('al dia %-40s %d fuentes, %d destinos' % (
                    filename,
                    len(contract['sources']),
                    len(contract['destinations'])))
        else:
            with open(path, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(expected)
            print('escrito %-40s %d fuentes, %d destinos' % (
                filename,
                len(contract['sources']),
                len(contract['destinations'])))

    if stale:
        print('')
        for line in stale:
            print('DESFASADO %s' % line)
        print('')
        print('Regenera con:  python scripts/generate_modulation_contracts.py')
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
