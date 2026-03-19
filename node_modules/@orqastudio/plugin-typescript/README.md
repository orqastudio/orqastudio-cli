![License](https://img.shields.io/badge/license-BSL%201.1-blue)
![Status](https://img.shields.io/badge/status-pre--release-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

![OrqaStudio](https://github.com/orqastudio/orqastudio-brand/blob/main/assets/banners/banner-1680x240.png?raw=1)

# TypeScript

OrqaStudio plugin for TypeScript development infrastructure — tsconfig presets, ESLint configs, and config composition for framework plugin extensions.

## Installation

```bash
orqa plugin install @orqastudio/plugin-typescript
```

## Usage

Provides base configs that other plugins extend:

- **tsconfig presets** — `base`, `library`, `app` (extend in your tsconfig.json)
- **ESLint configs** — strict TypeScript rules (import in eslint.config.js)
- **Config composition** — framework plugins (svelte, etc.) register extensions via `configExtensions` in their orqa-plugin.json

## License

BSL-1.1 — see [LICENSE](LICENSE) for details.
