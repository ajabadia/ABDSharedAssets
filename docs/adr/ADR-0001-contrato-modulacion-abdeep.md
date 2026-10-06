# ADR-0001 — Estandarizar las etiquetas del rango de destinos del contrato abdeep (Dest N)

> Estado: Aceptado
> Fecha: 2026-10-06
> Autor: ABDSharedAssets

---

## 1. Contexto

El contrato de modulacion `abdeep` describe la matriz de 8 buses del DeepMind 12:

> "Matriz de 8 buses del DeepMind 12. Los indices son indices de BYTE (93-116 de la trama SysEx) y su orden es el del manual: no se puede reordenar sin romper la compatibilidad de patches. Los destinos 74-128 los ejerce el hardware pero no hay evidencia de su etiqueta, asi que se declaran como \"Dest N\" a proposito (una etiqueta honesta vale mas que una inventada)."

Ese bloque describe el rango `74-128` como etiquetas genericas `"Dest N"`, pero en la Fase de estabilizacion se detecto una incongruencia: el indice de destino `73` estaba etiquetado como `"Fx 1 Level"`, un nombre que no esta soportado por la evidencia de hardware y que rompe la uniformidad del rango `73-128`.

El indice `73` cae dentro del rango de destinos que el hardware ejerce sin evidencia de etiqueta (208 bytes de destino sobre los 36 bytes de la trama, tal como reflejan `sourceMax: 22` y `destinationMax: 129`), por lo que la regla de politica se aplica tambien a el.

## 2. Decision

Renombrar la etiqueta del indice de destino `73` de `"Fx 1 Level"` a `"Dest 73"`, de modo que todos los destinos `73-128` usen la forma uniforme `"Dest N"`.

La etiqueta `"Fx 1 Level"` se mantiene en el indice de destino `129` (fuera de la trama SysEx, en el rango operativo del hardware), donde si existe evidencia del nombre.

Cambio aplicado en `contracts/abdeep_modulation_matrix.json`:

```diff
@@ -362,7 +362,7 @@
      {
        "label": "Seq Slew"
      },
      {
-      "label": "Fx 1 Level"
+      "label": "Dest 73"
      },
      {
        "label": "Dest 74"
```

## 3. Diferenciacion

- No cambia ningun indice ni el orden de la matriz. El orden sigue siendo el del manual y no se puede reordenar sin romper la compatibilidad de patches.
- No cambia ninguna fuente (`None`, `Pitch Bend`, `Mod Wheel`, `Foot Ctrl`, `BreathCtrl`, `Pressure`, `Expression`, `LFO 1`, `LFO 2`, `Env 1`, `Env 2`, `Env 3`, `Note Num`, `Note Vel`, `Note Off Vel`, `Ctrl Seq`, `LFO 1/2 (Uni)`, `LFO 1/2 (Fade)`, `Voice Num`, `Uni Voice`, `CC X (115)`, `CC Y (116)`, `CC Z (117)`).
- No cambia el esquema del contrato (`schemaVersion "1.0"`), ni el rango de bytes (`93-116` de la trama SysEx, 8 slots), ni la autoridad (`authority: "hardware"`).
- El cambio es exclusivamente la etiqueta del destino `73`, dentro del rango `"Dest N"`.

## 4. Consecuencias

- Los destinos `73-128` quedan etiquetados de forma consistente con la politica de "etiqueta honesta": si no hay evidencia de la etiqueta real, se declara `"Dest N"`.
- La etiqueta unica `"Fx 1 Level"` desaparece del rango de destinos de la trama y solo aparece en el indice `129`.
- No afecta a la serializacion ni a la compatibilidad de patches: solo cambia una cadena de etiqueta.
- Un consumidor que mostrara al usuario la etiqueta del destino `73` pasa de ver `"Fx 1 Level"` a ver `"Dest 73"`.

## 5. Referencias

- `contracts/abdeep_modulation_matrix.json` — contrato modificado por esta decision.
- `ABDEep/WebUI/resources/md/deepmind_fx_modmatrix.md` — manual (fuente de etiquetas).
- `ABDEep/docs/sysex_format.md` — rango de byte de la trama SysEx.
- `ABDEep/WebUI/js/modmatrix_data.js` — datos de la matriz en la WebUI.
- `ABDEep/resources/hardware_dumps/2026-08-10` — mediciones (1024 presets de fabrica, 8192 slots) que sustentan `sourceMax` y `destinationMax` medidos.