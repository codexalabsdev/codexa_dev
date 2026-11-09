# Integração de licença remota

## 1. Criar a licença

No painel administrativo, crie a licença para o sistema e informe, opcionalmente, o domínio autorizado (por exemplo, `cliente.com.br`). O domínio aceita o endereço exato e seus subdomínios. Não inclua `https://`, portas ou caminhos.

## 2. Instalar o script

Copie a tag exibida no painel para o HTML do sistema cliente, de preferência antes do fechamento de `</body>`:

```html
<script src="https://SEU-PAINEL/client-script.js?token=SUA_CHAVE&api=https%3A%2F%2FSEU-PAINEL%2Fapi%2Flicenses%2Fvalidate" defer></script>
```

A chave deve ficar no parâmetro `token`. Não a coloque em logs ou repositórios públicos.

## 3. Marcar os módulos

Na licença, marque o módulo como contratado e depois habilite-o. O script remove elementos com `data-license-module="codigo-do-modulo"` quando o módulo não estiver liberado.

`data-license-action` é metadado semântico para identificar a operação (`read`, `create`, `update` ou `delete`). O script visual aplica a decisão no nível do módulo; a autorização da ação deve ser feita no backend com o SDK server-side.

## 4. Validar no sistema cliente

A validação envia `POST` para `/api/licenses/validate` com `Authorization: Bearer SUA_CHAVE`. A resposta informa `valid` e a lista de módulos. O domínio de origem é verificado no servidor.

## 5. Proteger o backend

Instale o arquivo `lib/licensing/server.ts` no sistema cliente ou publique-o como pacote interno. Configure somente no servidor:

```env
CODEXA_LICENSE_API_URL=https://SEU-PAINEL/api/licenses/validate
CODEXA_LICENSE_KEY=chave-da-licenca
CODEXA_LICENSE_TIMEOUT_MS=5000
CODEXA_LICENSE_CACHE_TTL_SECONDS=120
```

Em cada Route Handler ou Server Action protegido:

```ts
import { requireLicensedModule, LicenseAuthorizationError } from '@/lib/licensing/server'

export async function POST(request: Request) {
  try {
    await requireLicensedModule({ module: 'financeiro', action: 'create', request })
    // validar usuário/RBAC e entrada antes de gravar dados
    return Response.json({ ok: true })
  } catch (error) {
    if (error instanceof LicenseAuthorizationError) {
      return Response.json({ error: error.reason }, { status: error.status })
    }
    throw error
  }
}
```

A chave `CODEXA_LICENSE_KEY` nunca deve ser exposta ao navegador. A licença não substitui autenticação, RBAC ou RLS. Se o cliente usa Supabase diretamente pelo browser, mova operações sensíveis para o servidor e mantenha RLS ativo.

## 6. Preparar uma instalação exclusiva

Ao criar a licença, o painel chama `POST /api/admin/licenses/:licenseId/integration` e prepara uma instalação `nextjs-supabase`. A resposta administrativa contém, uma única vez:

- `installationId`: identificador público estável da instalação;
- `integrationToken`: credencial privada server-to-server, armazenada somente como hash;
- `manifest`: configuração não secreta e versão do SDK;
- `status`: começa em `awaiting_installation` e só muda para `connected` depois de uma validação real.

Configure o token no ambiente privado do cliente. Para gerar/rotacionar novamente, use a mesma operação; o token anterior deixa de ser utilizável quando a integração for revogada. O painel não deve enviar esse token por URL pública, JavaScript ou repositório.

## 7. Diagnóstico e limites

O endpoint `GET /api/admin/licenses/:licenseId/integration` informa o último estado observado pela Codexa. Ele não consegue verificar arquivos, variáveis ou RLS de um repositório que não foi conectado. Portanto, “conectada” significa apenas que uma chamada real server-to-server foi validada; a cobertura das rotas protegidas continua sendo responsabilidade do projeto cliente.

## 8. Middleware por rotas

Na área de detalhes avançados da licença, configure cada rota real do cliente e associe-a ao módulo pelo `internal_code` já cadastrado. A Codexa não deduz rotas a partir do nome visual do módulo.

A geração usa `GET /api/admin/licenses/:licenseId/middleware` e produz um `middleware.ts` com `ROUTES` e `config.matcher` estáticos, compatíveis com Next.js. O arquivo consulta `/api/licenses/validate` server-to-server usando `CODEXA_LICENSE_KEY`; o token nunca aparece no arquivo gerado. Rotas duplicadas, caminhos inválidos ou módulos de outro sistema são rejeitados.

Exemplo para `app/admin/page.tsx`: configure `/admin/categorias/:path*`, `/admin/produtos/:path*` e `/admin/financeiro/:path*` no painel, associando cada rota ao `internal_code` correspondente. O middleware protege a navegação, mas a página ainda deve renderizar cada módulo com `getCodexaLicense()`/`requireLicensedModule` e cada Route Handler ou Server Action deve repetir a autorização no ponto de execução.

Se já existir `middleware.ts` no cliente, não substitua silenciosamente: incorpore o bloco de verificação à função existente e mescle manualmente o `config.matcher`. O arquivo gerado é determinístico e deve ser revisado antes de substituir qualquer arquivo personalizado.

O bloqueio usa falha segura: credencial ausente, licença inválida, módulo não autorizado ou indisponibilidade da API redirecionam para o `blockedPath` configurado. Isso não protege consultas diretas ao Supabase, Storage, APIs ou Server Actions; esses pontos precisam de RLS e validação server-side.

## 9. Suspensão e atualização

A licença é revalidada a cada carregamento no script. No SDK server-side, respostas positivas ficam em cache apenas pelo TTL configurado, limitado a 5 minutos; respostas inválidas nunca são armazenadas positivamente. Uma suspensão pode levar até o TTL para bloquear um cliente que já possui cache positivo. O domínio exato e seus subdomínios são aceitos; `cliente.com.br.evil.com` não é aceito. Requisições server-to-server sem `Origin` continuam permitidas e devem ser protegidas pela chave privada.
