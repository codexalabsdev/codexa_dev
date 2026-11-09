# Central licensing

The Codexa workspace manages licenses and module entitlements at `/workspace/licencas`. License keys are generated with high entropy, shown once, stored as SHA-256 hashes, and never returned by list or update endpoints.

## Required configuration

Set these variables in the central deployment's server environment:

- `SUPABASE_SERVICE_ROLE_KEY` (or the Supabase `SUPABASE_SECRET_KEY`): server-only credential used by protected administration and validation routes. Never use a `NEXT_PUBLIC_` prefix.
- `NEXT_PUBLIC_SUPABASE_URL` and a publishable/anon key, as already required by the application.

For each customer application, set these server-only variables. In local Next.js development use `.env.local`; in production set them in the hosting provider's environment settings:

- `LICENSE_VALIDATION_URL`: the central deployment URL ending in `/api/licenses/validate` (with **licenses**, not `licences`).
- `LICENSE_KEY`: the issued license key. Do not expose it to browser code or prefix it with `NEXT_PUBLIC_`.

Apply `supabase/migrations/20261022100000_license_management.sql` to the central Supabase project before using the feature. It migrates existing plaintext license keys to hashes, adds module entitlements, and installs database-backed rate limiting. The migration is not applied automatically by this application.

## Cadastro de módulos e emissão de licenças

1. Cadastre o sistema do cliente em **Sistemas** e associe o cliente.
2. Em **Módulos**, crie cada funcionalidade com um `internal_code` único e estável. Associe-a ao sistema correto; deixe sem sistema somente se for compartilhada.
3. Use `Contratado`, `Licença válida` ou `Acesso liberado` para que o módulo possa ser liberado na licença. `Indisponível` bloqueia a liberação. O status de implementação é informativo.
4. Em **Licenças**, emita a licença para o cliente e o sistema. Copie a chave exibida uma única vez e configure `LICENSE_KEY` e `LICENSE_VALIDATION_URL` no servidor do sistema cliente.
5. Marque o módulo como **Contratado** e depois **Liberado**. A licença também pode ser suspensa, revogada ou receber uma data de expiração.

## Integração rápida com Next.js (App Router)

Copie `lib/licensing/license-guard.ts` e `lib/licensing/server.ts` deste projeto para o mesmo caminho no projeto Next.js cliente. Configure as duas variáveis acima. Em cada rota de servidor que entrega uma funcionalidade paga, envolva o handler com `withLicensedModule` e use exatamente o `internal_code` cadastrado no Codexa:

```ts
import { withLicensedModule } from '@/lib/licensing/server'

export const GET = withLicensedModule('relatorios-avancados', async () => {
  return Response.json({ enabled: true })
})
```

O wrapper responde `403` quando o módulo não está liberado e `503` quando não consegue validar a licença. Ele protege o código dentro desse handler; envolva cada rota que realmente precisa de proteção. A validação é reutilizada por 30 segundos por padrão (máximo de 5 minutos) e o acesso é negado se o serviço estiver indisponível e não houver validação em cache.

Para mostrar ou esconder partes da interface renderizadas no servidor, `hasLicensedModule('relatorios-avancados')` retorna `true` ou `false`. Isso é apenas uma conveniência visual, não substitui a proteção da rota. `checkLicense()` retorna o resultado completo. Não importe o helper em componentes de cliente (`'use client'`).

## Validation endpoint

This is a server-to-server endpoint. Opening it in a browser sends `GET` and does not test the integration. Use exactly `/api/licenses/validate` (with “licenses”), send a `POST`, and provide the generated key in a Bearer authorization header.

The endpoint returns license validity and module fields `contracted`, `enabled`, `available`, and `licensed`. Invalid keys return `401`; expired, suspended, or revoked licenses return `200` with `valid: false`. Requests are limited to 60 per source IP per minute. Responses are not cacheable by HTTP intermediaries. Deployments must run behind a trusted reverse proxy that overwrites `x-real-ip` (or sanitizes `x-forwarded-for`) for the IP-based limit to be reliable.
