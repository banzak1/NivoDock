# Publicar versões do NivoDock

## GitHub Releases

1. Atualize `VERSION`, `package.json` e `CHANGELOG.md` para a versão da entrega. Revise a versão exibida na interface e rode `npm test`.
2. Gere o pacote para Windows x64 com `scripts/build-release.ps1` e confira o ZIP e o arquivo `.sha256` em `dist/`.
3. Envie o commit da versão ao GitHub. Crie uma release para a tag `vX.Y.Z` apontando para esse commit, anexe o ZIP e o `.sha256` e use o changelog nas notas.

O ZIP de Releases permite instalar e atualizar manualmente. Para oferecer a mesma versão no atualizador do aplicativo, publique também o manifesto assinado conforme o procedimento abaixo. O canal integrado começa com a URL vazia.

## O que hospedar

Um endereço HTTPS estável para `latest.json` e um ZIP completo por versão. Ambos precisam ser acessíveis sem login. Pode ser armazenamento estático, CDN ou um repositório dedicado aos binários/releases. A escolha não obriga a publicar o código-fonte; não publique catálogo/configuração, saves, perfis ou chaves privadas.

Em releases, um endereço de exemplo é `https://github.com/SEU-USUARIO/nivodock-releases/releases/latest/download/latest.json`, com pacote em `.../releases/download/v1.5.0/NivoDock-v1.5.0-win-x64.zip`. São exemplos, não destinos configurados ou criados. Um repositório privado que exija token não serve como canal público sem uma camada de distribuição própria; não embuta tokens no cliente.

## Preparação inicial

1. Guarde a chave privada de assinatura fora do projeto, com acesso restrito e backup seguro. Perder a chave exige uma distribuição manual para estabelecer outra relação de confiança. Use a mesma identidade nas próximas versões do canal.
2. Escolha o endereço estável e configure antes de gerar o pacote: `node scripts/configure-updates.cjs https://SEU-HOST/updates/latest.json`.
3. Ajuste VERSION/package.json/interface/changelog para a versão da entrega e faça o commit/tag conforme o fluxo do projeto. Se uma tag já foi distribuída, crie uma nova versão; não substitua tags publicadas.
4. Gere o ZIP: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-release.ps1 -NodePath <node.exe>`.

A chave pública em `update-channel.json` deve acompanhar as instalações. Para uma identidade nova, o gerador `node scripts/create-update-key.cjs <arquivo-privado-fora-do-projeto>` existe, mas recusa substituir configuração/chave existentes. Não é necessário usá-lo novamente nesta instalação.

## Assinar e publicar

Crie um JSON simples com as novidades, por exemplo `["Melhorias de descoberta", "Correções da interface"]`, e execute no ambiente de desenvolvimento:

```sh
node scripts/sign-update.cjs \
  --package dist/NivoDock-v1.5.0-win-x64.zip \
  --url https://SEU-HOST/versoes/1.5.0/NivoDock-v1.5.0-win-x64.zip \
  --key /caminho/privado/signing-key.pem \
  --out dist/latest.json \
  --notes /tmp/notas-nivodock.json
```

O assinador confere o ZIP, inventário, versão e canal/chave do pacote antes de criar o manifesto. O envelope contém o payload JSON em base64 e assinatura RSA/SHA256; base64 não é criptografia. O pacote não carrega chave privada. A assinatura autentica a publicação, sem substituir a assinatura Authenticode de executáveis do Windows.

Publique primeiro o ZIP no endereço definitivo; publique `latest.json` por último, depois de comprovar o download do pacote. Preserve URLs/hashes por versão, evite cache longo no manifesto e mantenha o mesmo ZIP para OTA/download manual. Publicar o manifesto antes do arquivo causa falha de download, sem instalação parcial.

A hospedagem é uma etapa externa separada: nenhum repositório, conta, release ou upload foi criado automaticamente nesta implementação. Valide uma nova instalação com o endereço configurado antes de enviar aos amigos. Quem está na v1.4 precisa do primeiro pacote manual; uma cópia v1.5 sem URL também precisa receber o pacote com canal configurado uma vez.

## Contrato e recuperação

O manifesto declara produto, canal, plataforma win-x64, versão estável, versão mínima, URL HTTPS, tamanho, SHA256 e notas. O cliente rejeita assinatura errada, downgrade e manifesto incompatível. Versão mínima acima da instalada oferece o ZIP manual.

Após a confirmação, o cliente baixa/verifica e o trabalhador isolado revalida antes de encerrar o servidor. `.updates/transaction.json` e `.updates/backup-*` preservam arquivos anteriores; biblioteca/configuração/perfil/capas/backups de saves não são destinos de cópia ou remoção. O runtime do worker é uma cópia do runtime incluído, sem ferramenta externa para o jogador.

A nova instância precisa responder com versão e nonce esperados. Falha de boot provoca rollback automático e reinício da versão anterior. Uma interrupção de escrita é tratada na próxima abertura pelo inicializador; arquivos de backup são conferidos antes de restaurar. Uma falha persistente de disco/permissão pode exigir correção do ambiente e abertura novamente; preserve `.updates/` nesse caso.

Mantém um backup anterior, além do runtime do worker; downloads e extrações concluídos são descartados quando possível. A atualização completa precisa de espaço para pacote, extração e backup temporários. Não é atualização delta, instalador online, sincronização de saves ou DRM.

As sessões acompanhadas por `activeSession` e lançamentos em andamento adiam a instalação. Processos abertos fora do NivoDock e jogos Steam que o launcher não acompanha não são inventados como sessões; o trabalhador modifica apenas arquivos do aplicativo e não encerra esses jogos.

Referência técnica de assinatura: [documentação oficial de crypto do Node.js](https://nodejs.org/docs/latest-v22.x/api/crypto.html).
