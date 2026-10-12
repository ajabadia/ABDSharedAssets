# 📢 Aviso Formal de Deprecación y Archivo — ABDSharedAssets

> **Fecha:** Octubre 2026  
> **Estado:** ARCHIVADO (DEPRECATED) — MODO SOLO LECTURA  
> **Destino:** [`ABDShared`](https://github.com/ajabadia/ABDShared.git)

---

## 🧭 ¿Por qué este repositorio está en desuso?

Como parte de la **Estandarización de la Suite ABDSynths**, se ha unificado la infraestructura compartida en un único repositorio canónico universal: **`ABDShared`**.

Todo el contenido de este repositorio ha sido consolidado en los cuadrantes correspondientes de `ABDShared`:
- **`Assets/`**: Modelos, marcas, iconografía SVG, tipografías y tokens CSS base.
- **`Components/`**: Componentes interactivos modulares WebUI (`LiveSysExInspector`, `SynthNavBar`, `FitStage`, `AboutDialog`, `Controls`, etc.).
- **`Contracts/`**: Contratos SSOT de hardware y parámetros (`casio_cz101`, `korg_ms2000`, etc.).
- **`Utils/`**: Utilidades DOM y sincronización.

---

## 🛠️ Cómo migrar un proyecto consumidor

### En `package.json` (WebUI):
Consumo directo Zero-Copy a través del workspace pnpm:

```json
{
  "dependencies": {
    "@abdsynths/shared": "workspace:*"
  }
}
```

Imports estándar disponibles:
- `import { SynthNavBar, FitStage } from '@abdsynths/shared/components';`
- `@import '@abdsynths/shared/styles/tokens.css';`

### Repositorio canónico:
👉 https://github.com/ajabadia/ABDShared.git
