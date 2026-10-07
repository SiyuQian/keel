# Keel

[English](../../README.md) · Español

Keel es un Agentic Development Environment (ADE) independiente en desarrollo sobre [Orca](https://github.com/stablyai/orca). Reúne agentes de programación, terminales, revisión de código y espacios de trabajo.

## Estado del proyecto

Keel es el nombre provisional. La implementación conserva el nombre de aplicación Orca, el comando `orca`, las variables `ORCA_*` y las rutas de configuración. Las descargas, servicios alojados, comunidades y firmas de Orca no pertenecen a Keel. Ejecuta el proyecto desde el código fuente.

## Ejecutar desde el código fuente

Instala Node 24, pnpm y la [versión fijada de Bun](../../config/.bun-version). Para aplicaciones y pruebas iniciadas por agentes, configura `ORCA_BACKGROUND_LAUNCH=1`. Antes de empaquetar para otra CPU, ejecuta `pnpm install:release`.

```sh
git clone https://github.com/SiyuQian/keel.git
cd keel
pnpm install
pnpm dev
```

## Documentación y contribuciones

- [Documentation index](../README.md)
- [Contributing](../../.github/CONTRIBUTING.md)
- [Architecture](../ARCHITECTURE.md)
- [Issues](https://github.com/SiyuQian/keel/issues) · [Pull requests](https://github.com/SiyuQian/keel/pulls)

## Origen y licencia

Keel deriva de Orca bajo la licencia MIT. Se conservan el historial de Git, el aviso de copyright y la licencia originales.

[MIT License](../../LICENSE) · [Project provenance](../UPSTREAM.md)
