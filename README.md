# 📦 ABDSharedAssets — Recursos, Estilos, Iconos y Contratos Compartidos

Repositorio centralizado de **recursos gráficos (modelos y marcas)**, **iconografía vectorial monocromática**, **contratos de hardware JSON** y **sistema de diseño/estilos CSS** para todo el ecosistema de software y plugins de **ABDSynths** (`ABDAudioLab`, `ABDBankManager`, `ABDMS2000`, `ABDCZ101`, `ABDEep`, `ABDJUNiO601`, `ABDScope`, `ABDMIDIKeyb`, etc.).

---

## 🏛️ Filosofía de Diseño: Fuente Única de la Verdad (*Zero-Copy*)

Para evitar duplicación de archivos, desincronizaciones accidentales o sobreescritura de versiones (*forks*), los proyectos satélite **nunca copian** los archivos. En su lugar, se vinculan mediante **Directory Junctions NTFS (`mklink /J`)**.

- Cualquier cambio realizado en este directorio maestro se refleja **de forma instantánea** en todos los proyectos dependientes.
- Los *Junctions* de Windows **no requieren privilegios de administrador** y son totalmente transparentes para compiladores, navegadores y DAWs.

---

## 📂 Estructura de los Cinco Pilares

```text
D:\desarrollos\ABDSynths\ABDSharedAssets\
├── brands/       <- Logotipos vectoriales SVG de fabricantes (Roland, Korg, Behringer, Casio, etc.)
├── models/       <- Renders e imágenes (WebP / PNG / SVG) de sintetizadores, módulos y bancos
├── icons/        <- Iconografía vectorial monocromática (currentColor) para controles e interfaces
├── contracts/    <- Contratos JSON de especificación de hardware y automatización
├── styles/       <- Sistema de diseño, tokens CSS globales, temas y componentes
└── docs/         <- Guías oficiales de integración, estilos e iconografía
    ├── INTEGRATION_GUIDE.md  <- Guía paso a paso para vincular nuevos proyectos
    ├── STYLES_GUIDE.md       <- Guía del sistema de diseño y tokens de tema
    └── ICONS_GUIDE.md        <- Guía de iconografía monocromática (política cero emojis)
```

---

## 📖 Documentación Detallada

- [Guía de Integración Zero-Copy](docs/INTEGRATION_GUIDE.md)
- [Guía del Sistema de Diseño y Tokens CSS](docs/STYLES_GUIDE.md)
- [Guía de Iconografía Monocromática (Cero Emojis)](docs/ICONS_GUIDE.md)
