# Guía de Integración — ABDSharedAssets (Zero-Copy)

> **Propósito:** Guía oficial para enlazar recursos compartidos (marcas, modelos, contratos y estilos) en cualquier plugin, sintetizador o herramienta de la suite ABDSynths.

---

## 1. Filosofía Zero-Copy (NTFS Directory Junctions)

Para cumplir con la directriz **DRY (Don''t Repeat Yourself)**:
- Los proyectos satélite **nunca copian** los archivos de este directorio.
- Se vinculan mediante **Directory Junctions NTFS (`mklink /J`)**.
- Los cambios realizados en `ABDSharedAssets` se reflejan **instantáneamente** en todos los proyectos vinculados sin recompilar assets.

---

## 2. Los Cuatro Pilares Compartidos

```text
D:\desarrollos\ABDSynths\ABDSharedAssets\
├── brands/       -> Logotipos vectoriales SVG de fabricantes (Roland, Korg, etc.)
├── models/       -> Renders WebP/PNG de sintetizadores, módulos y bancos
├── contracts/    -> Contratos JSON de hardware y automatización
└── styles/       -> Sistema de diseño, tokens CSS globales y temas
```

---

## 3. Mapa de Enlaces por Proyecto

| Proyecto | Carpeta Local | Destino en `ABDSharedAssets` | Comando NTFS |
|---|---|---|---|
| **Sintetizadores VST/AU** | `WebUI\assets\brands` | `..\..\ABDSharedAssets\brands` | `mklink /J "WebUI\assets\brands" "..\..\ABDSharedAssets\brands"` |
| **Sintetizadores VST/AU** | `WebUI\assets\models` | `..\..\ABDSharedAssets\models` | `mklink /J "WebUI\assets\models" "..\..\ABDSharedAssets\models"` |
| **Sintetizadores VST/AU** | `WebUI\src\styles\shared` | `..\..\..\ABDSharedAssets\styles` | `mklink /J "WebUI\src\styles\shared" "..\..\..\ABDSharedAssets\styles"` |
| **ABDAudioLab** | `assets\brands` | `..\ABDSharedAssets\brands` | `mklink /J "assets\brands" "..\ABDSharedAssets\brands"` |
| **ABDAudioLab** | `assets\models` | `..\ABDSharedAssets\models` | `mklink /J "assets\models" "..\ABDSharedAssets\models"` |
| **ABDAudioLab** | `contracts\hardware` | `..\ABDSharedAssets\contracts` | `mklink /J "contracts\hardware" "..\ABDSharedAssets\contracts"` |
| **ABDBankManager** | `WebUI\images` | `..\..\ABDSharedAssets\models` | `mklink /J "WebUI\images" "..\..\ABDSharedAssets\models"` |

---

## 4. Script Automatizado para Nuevos Proyectos (`setup_links.bat`)

Para conectar un nuevo proyecto automáticamente, crea este archivo en la raíz del proyecto nuevo:

```bat
@echo off
set "SHARED=..\ABDSharedAssets"
if not exist "%SHARED%" (
    echo [ERROR] No se encuentra ABDSharedAssets en %SHARED%
    exit /b 1
)

:: Assets gráficos
if not exist "WebUI\assets" mkdir "WebUI\assets"
if not exist "WebUI\assets\brands" mklink /J "WebUI\assets\brands" "%SHARED%\brands"
if not exist "WebUI\assets\models" mklink /J "WebUI\assets\models" "%SHARED%\models"

:: Estilos y Temas
if not exist "WebUI\src\styles" mkdir "WebUI\src\styles"
if not exist "WebUI\src\styles\shared" mklink /J "WebUI\src\styles\shared" "%SHARED%\styles"

echo [OK] Junctions creados correctamente.
```
