# Arquitetura do NivoDock

## Inicialização

`LauncherHost.cs` compila para `NivoDock.exe`. Ele tenta recuperar uma atualização interrompida, inicia `server.js` com o Node.js do pacote e abre a interface no Edge em modo aplicativo. Durante o desenvolvimento, `npm start` sobe o servidor diretamente. A API HTTP escuta em `127.0.0.1:47890` por padrão.

## Componentes

| Arquivos | Responsabilidade |
| --- | --- |
| `public/index.html`, `public/update-ui.js` | Interface de biblioteca, navegação por teclado e controle, cards e avisos de atualização. |
| `server.js` | API local, lançamento de jogos, rastreamento de sessões, leitura Pokémon e operações explícitas de backup e sincronização. |
| `environment.js`, `game-manifests.js`, `discovery.js` | Localização das bibliotecas no Windows, leitura dos metadados e verificação de instalações. |
| `library.js` | Reconciliação da descoberta com o catálogo e gravação atômica dos JSONs. |
| `artwork.js` | Correspondência de capas por jogo e cache local. |
| `save-locations.js`, `progress.js`, `progress-readers.js`, `progress-formats.js` | Localização de saves, seleção de perfil, leitura específica por jogo e cache do progresso. |
| `updater.js`, `update-core.js`, `update-worker.js` | Verificação, aplicação e recuperação de atualizações assinadas. |
| `Installer.cs`, `autostart.js` | Instalação opcional, atalhos e início automático com o Windows. |

## Biblioteca e progresso

A descoberta roda ao abrir, a cada 90 segundos e por solicitação na interface. Cada instalação é verificada com os arquivos encontrados. Jogos ausentes, incompletos ou não verificados ficam no Histórico. A reconciliação preserva favoritos, tempo jogado e seleção de saves.

A interface carrega os dados com `GET /api/data` e consulta `GET /api/status` para acompanhar mudanças. Os leitores de progresso interpretam arquivos locais já gravados e retornam apenas os campos suportados. A [matriz de compatibilidade](COMPATIBILIDADE-PROGRESSO.md) descreve os formatos e seus limites.

## Dados locais e distribuição

`games.json`, `config.json`, `.deck-profile/`, `backups/`, `.updates/` e `public/artwork/` são dados locais. O código-fonte funciona com um catálogo vazio e cria a configuração padrão quando necessário. O script de build usa uma lista explícita de arquivos para montar o ZIP.

A distribuição manual usa o ZIP e o SHA-256 de cada release. Com um canal configurado, o atualizador integrado valida o manifesto e o pacote, aplica a versão após confirmação e restaura a anterior se a nova falhar na inicialização. Veja o [procedimento de publicação](PUBLICAR-ATUALIZACOES.md).
