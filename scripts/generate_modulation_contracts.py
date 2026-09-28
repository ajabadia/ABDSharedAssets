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

# Los destinos por voz y los que reemplazan, tal cual los declara hoy el switch
# de NeuronikEngine::applyModulation. La fuente de la verdad es el switch, asi
# que la lista se contrasta contra el al final.
NEURONIK_PER_NOTE = {1, 10, 12, 13, 14, 15, 16}
NEURONIK_REPLACES = {1, 10, 12, 13, 14, 15, 16}


def parse_neuronik_table():
    """Lee getModDestinationTable() de ParameterDefinitions.h."""
    text = read(os.path.join(
        ROOT, 'ABDNeural', 'Source', 'State', 'ParameterDefinitions.h'))
    start = text.index('getModDestinationTable()')
    open_brace = text.index('{', text.index('table', start))
    end = text.index('};', open_brace)
    body = text[open_brace:end]

    rows = []
    for m in re.finditer(
            r'\{\s*"([^"]*)"\s*,\s*(nullptr|[A-Za-z_:]*IDs::\w+)', body):
        label = m.group(1)
        param = m.group(2)
        if param == 'nullptr':
            parameter_id = None
        else:
            parameter_id = param.split('::')[-1]
        rows.append((label, parameter_id))
    return rows


def build_neuronik():
    rows = parse_neuronik_table()
    dests = []
    for index, (label, parameter_id) in enumerate(rows):
        entry = {'label': label, 'parameterId': parameter_id}
        if index in NEURONIK_PER_NOTE:
            entry['perNote'] = True
        if index in NEURONIK_REPLACES:
            entry['replaces'] = True
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
        'destinations': dests,
        'provenance': {
            'source': ('Source/State/ParameterDefinitions.h '
                       '(getModDestinationTable + getModSources) y el switch de '
                       'NeuronikEngine::applyModulation'),
            'verifiedAt': '2026-09-28',
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
