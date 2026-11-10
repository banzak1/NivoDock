# Changelog — NivoDock

Todas as mudanças notáveis do projeto **NivoDock** (anteriormente Banzak Game Deck) estão documentadas neste arquivo, seguindo o versionamento semântico até a **v2.0.0**.

---

## [2.0.0] - 2026-11-05 — Cards de progresso por jogo

- Novo serviço de progresso com leitores isolados, cache limitado, detecção de mudanças, origem dos dados, matriz de capacidades e seleção persistente de arquivo/perfil.
- Leitores locais Dragonwilds, Skyrim SE, Hytale, No Man’s Sky, Megabonk e Vampire Survivors; preservação de Pokémon e suporte separado a level.dat Java/Bedrock.
- UI com resumo, XP/habilidades/personagens, equipamento/durabilidade, objetivos, seleção manual e catálogo de compatibilidade para toda a biblioteca.
- Removidos níveis fictícios por XP/500, SaveCount como campanha/dificuldade, máximos de HP arbitrários e afirmações de nuvem baseadas apenas na loja.
- Perfil mais recente por gravação, jamais maior nível; ausência de escolha explícita não troca de personagem. Escritas incompletas mantêm leitura anterior identificada.
- Textos e caminhos de saves são renderizados como texto; parsers têm limites e não escrevem nos arquivos dos jogos.
- Compatibilidade da interface com respostas anteriores restaurada para impedir cards ocultos na transição; servidor local atualizado após confirmar ausência de jogo ativo.
- OTA/instalador/ZIP permanecem standalone; hospedagem pública segue pendente. Não há cobrança/Pro implementados.
- Compatibilidade e limites na [matriz de progresso](docs/COMPATIBILIDADE-PROGRESSO.md).

---

## [1.5.0] - 2026-11-05 — Atualizador integrado

### Added
- Consulta ao abrir/a cada seis horas, aviso, novidades, adiamento, confirmação e progresso de download.
- Manifesto autenticado com chave pública RSA fixa, HTTPS e verificação de SHA256/tamanho/inventário do pacote; nenhuma chave privada é distribuída.
- Trabalhador isolado com cópia do runtime incluído; troca de arquivos da aplicação, backup e verificação de inicialização, sem instalação de dependências pelo jogador.
- Retorno automático à versão anterior quando a nova não inicia e recuperação de transações interrompidas pelo inicializador.
- Adiamento durante sessões acompanhadas pelo launcher e nova checagem após o download. API bloqueia alterações durante a aplicação.
- Ferramentas de configuração e assinatura/publicação. O canal fica explicitamente não publicado até escolher hospedagem/configurar a URL.

### Validation
- Testes de assinatura adulterada, downgrade, arquivos maliciosos/corrompidos, links no destino, preservação de dados, concorrência e rotas locais.
- Windows: atualização completa, falha de inicialização com rollback e interrupção simulada recuperada, em caminho com acentos.

---

## [1.4.0] - 2026-11-05 — Descoberta ampliada e organização
### Added
- Leitores de manifestos GOG e MicrosoftGame.config para instalações desktop, confirmando o executável real antes de adicionar o jogo.
- Busca de metadados nas pastas registradas e nos caminhos indicados por DisplayIcon, incluindo diretórios personalizados e nomes fora do catálogo inicial.
- Pesquisa estrutural do Hytale em mais locais, canais e versões, com confirmação do cliente e Assets.zip.
- Diagnósticos de fontes, pastas visitadas e limites da busca.

### Fixed
- Caminhos com acentos preservados na comunicação com o Windows.
- Launchers, aplicativos comuns, metadados residuais e downloads incompletos não viram jogos prontos apenas pela presença de uma entrada.
- Jogos já cadastrados com o mesmo executável/argumentos podem adquirir identidade da loja sem duplicar nem perder preferências; exclusões concorrentes continuam respeitadas.
- Executáveis de lojas não criam uma segunda entrada nativa nem contornam estados de download incompleto.

### Maintenance
- Planos e histórico organizados em docs/; sobras de builds tratadas separadamente dos dados pessoais.
- O gerador descarta a pasta expandida da release por padrão, evitando acumular cópias do runtime; -KeepExpanded é opcional para validação.
- Painéis avançados continuam na preparação para a v2.0.

---

## [1.3.2] - 2026-11-05 — Distribuição limpa NivoDock
### Fixed
- Retirados os executáveis com o nome anterior e sua geração no empacotador.
- Instalador usa somente a pasta padrão NivoDock; removida a reutilização de instalações com outro nome.
- Autostart e variáveis de ambiente utilizam apenas identificadores NivoDock.
- Nomes genéricos de personagem substituem placeholders pessoais quando o save não contém um nome.

### Distribution
- Pacote para instalações novas com guia do jogador; histórico e documentação de desenvolvimento ficam no repositório.
- Gerador bloqueia identificadores antigos de produto e dados pessoais no pacote.
- Novos ZIP e partes para Discord, ambos verificados, com versão 1.3.2. Cards avançados seguem planejados para a v2.0.

### Validation
- Resultados em `VALIDACAO-v1.3.2.json` e `REVISAO-v1.3.2.md`.

---

## Distribuição adicional da v1.3.1 — 2026-11-05

- Variante em dois ZIPs abaixo de 20 MB por arquivo para envio em mensagens separadas.
- Preparador Windows que recompõe o pacote, verifica o hash original e extrai o aplicativo completo, sem downloads ou ferramentas adicionais no PC de destino.
- Aplicativo, executáveis e runtime da v1.3.1 mantidos sem alterações. Validação em `VALIDACAO-DISCORD-v1.3.1.json`.

---

## [1.3.1] - 2026-11-05 — Refinamento da identidade e da hierarquia visual
### Changed
- Assinatura azul violeta concentrada em seleção e ações principais, mantendo a base grafite e as capas coloridas.
- Símbolo N redesenhado com duas peças em conexão; logos, PNGs, ICO e executáveis atualizados.
- Cabeçalho com busca, categorias em linha e menu Gerenciar, substituindo a fileira de botões de manutenção.
- Botões secundários e indicadores mais discretos; ícones vetoriais consistentes nas ações do jogo.
- Categorias usam botões nativos, foco visível e estado acessível. O menu fecha por Esc ou clique fora e não intercepta Enter como comando para iniciar jogo.

### Fixed
- Painel universal usa a marca do aplicativo em vez do avatar de treinador Pokémon.
- Informações de instalação, saves e sessões são exibidas como texto; barras de HP continuam reservadas aos personagens.

### Validation
- Resultados em `REVISAO-v1.3.1.md` e `VALIDACAO-v1.3.1.json`.

---

## [1.3.0] - 2026-11-05 — NivoDock e identidade visual
### Added
- Nome NivoDock na interface, títulos, instalador, executáveis e pacote Windows.
- Símbolo vetorial próprio, logos para fundos claros/escuros, PNGs e ícone Windows incorporado aos executáveis; guia visual em `public/brand/index.html`.
- Paleta grafite, cinza e branco, capas coloridas e destaque neutro independente do jogo selecionado.
- Foco visível de teclado e respeito à preferência de movimento reduzido.
- Variáveis `NIVODOCK_PORT` e `NIVODOCK_DISABLE_AUTOSCAN`, com os nomes antigos aceitos para compatibilidade.

### Fixed
- O autostart reconhece os atalhos criados pelo instalador antigo e as entradas novas; desligar remove duplicatas conhecidas.
- O instalador novo usa o mesmo formato de autostart da interface e reutiliza a instalação padrão antiga quando disponível.

### Compatibility
- `BanzakGameDeck.exe` permanece no pacote como alias do novo inicializador, preservando atalhos anteriores.
- Sem mudança nos arquivos da biblioteca, configurações, saves, backups ou perfil do navegador. A pasta existente pode continuar com o nome antigo.
- Plano Free/Pro, anúncios, licenciamento comercial e atualizador integrado continuam no roadmap.

### Validation
- Evidências e limites em `REVISAO-v1.3.0.md` e `VALIDACAO-v1.3.0.json`.

---

## [1.2.0] - 2026-11-05 — Instalações reais e distribuição standalone
### Added
- Descoberta de usuário, pastas, unidades, registros e bibliotecas do Windows sem caminhos pessoais fixos.
- Leitura de bibliotecas adicionais Steam, manifestos Epic, produtos Battle.net e instalações Riot/EA; descoberta de emuladores e títulos standalone suportados.
- Estados instalado, ausente, incompleto e não verificado; reconciliação automática ao abrir e a cada 90 segundos.
- Aba Histórico para indisponíveis, mantendo identidade, favoritos, saves e tempo jogado; contagem padrão apenas de instalações confirmadas.
- Inclusão de pastas personalizadas pela interface e preenchimento automático de capas de instalações confirmadas em segundo plano.
- Localização de saves relativa ao usuário/instalação e identificação dos slots Ryujinx pelo ID do jogo.
- Gerador de pacote Windows x64 com Node incluído, licença, executáveis compilados, manifesto e hashes. A distribuição exclui dados pessoais do desenvolvedor.

### Fixed
- Clientes e nomes residuais Battle.net não adicionam Diablo III, Diablo IV, Overwatch ou outros jogos ausentes.
- Manifestos sem arquivos e downloads parciais não contam como instalações prontas.
- Unidades indisponíveis e falhas de permissão mantêm estado não verificado sem apagar registros.
- Reinstalação e mudança de localização preservam preferências e histórico dos jogos reconhecidos.
- ROMs de atualização/DLC e arquivos ZIP de ferramentas fora das pastas explícitas não são tratados como novos jogos base.
- Inicialização com caminho relativo e espera do servidor; instalador preserva biblioteca, configuração e backups existentes.
- Pasta de autostart e leitores de saves deixam de depender do perfil pessoal do desenvolvedor.

### Validation
- 42 testes automatizados aprovados em Node no Windows e no WSL; testes de interface e pacote descritos na revisão da versão.

---

## [1.1.0] - 2026-11-05 — Capas verificadas e integridade da biblioteca
### Added
- Cache local de imagens em `public/artwork/`, com validação de formato, limite de tamanho e tempo de resposta.
- Consulta ao catálogo Steam para obter os caminhos atuais de capas e banners por App ID.
- Fontes associadas aos títulos exatos para Riot, Blizzard, Libretro, DekuDeals e Hytale (IGDB).
- Atualização de capa por jogo, proteção de capas manuais e relatório de falhas sem substituir a imagem anterior.
- Testes de regressão com `node --test`, sem dependências adicionais.
- Roadmap da v1.2.0 para descoberta standalone e validação de instalação real, conforme pedido do usuário.

### Fixed
- Capas quebradas de Forza Horizon 6 e RuneScape: Dragonwilds; identificação de LoL, Hytale, Biped (antes Biped 2) e capas ausentes de PS2.
- A atualização agora inclui jogos Steam e rejeita resultados de títulos diferentes e bundles/DLCs.
- Edição preserva favoritos, histórico, metadados Steam, argumentos, diretório de trabalho e variáveis de ambiente.
- Digitar no filtro não dispara atalhos; busca ignora acentos; filtro vazio limpa o destaque anterior.
- Versão exibida obtida de `package.json`; barra superior e grade de informações evitam cortes por largura.
- Alternância de emuladores respeita a plataforma, evitando usar emuladores GBA em jogos DS/PS2.
- Atualizações de capas e varreduras preservam edições concorrentes na biblioteca.
- Gravação JSON por arquivo temporário; erros de leitura não transformam catálogo inválido em biblioteca vazia.
- A API rejeita origens externas, Hosts inesperados, formulários e JSON inválido; retirado CORS irrestrito.

### Scope
- A detecção e a contagem de jogos desinstalados, incluindo Battle.net, ficam para a v1.2.0. Nenhum registro foi removido nesta versão.

---

## [1.0.0] - 2026-11-04 — Production Release (Standalone Universal Game Deck)
### Added
- **Documentação Técnica e Guia de Recapitulação Completo (`DOCUMENTACAO-COMPLETA.md` e `README.md`)**:
  - Arquitetura detalhada do servidor Node.js zero-dependency e interface Glassmorphism 60fps.
  - Especificação completa dos **5 motores de desencriptação binária de saves** (GBA Gen 3, NDS Gen 4, Switch BDSP Unity, Switch/PC *Pokémon Legends: Z-A* `SwishCrypto` + `PA9`, e *RuneScape: Dragonwilds* JSON/UE5).
  - Análise técnica de viabilidade e guia passo a passo para migração futura para **Tauri v2 (Rust + WebView2)**.
  - Tabela de rotas da API REST, atalhos de controle/teclado e guia de manutenção.
- **Filtro Rápido em Tempo Real (`#quick-search`)**:
  - Barra de pesquisa instantânea no cabeçalho que filtra os 41+ jogos por nome, plataforma, subtítulo ou tags sem perder a navegação por controle/teclado.

---

## [0.9.0] - 2026-11-04 — Universal Multi-Store PC Scanner (Epic, Battle.net, Riot, EA & Standalone)
### Added
- **Scanner Multi-Lojas Automático (`scanSystemGames` em `server.js`)**:
  - **Steam**: Leitura de `libraryfolders.vdf` e `appmanifest_*.acf` em todos os discos (`C:\`, `D:\`, `E:\`).
  - **Epic Games Store**: Leitura de manifestos JSON em `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item` (detectando automaticamente *Vampire Survivors* e outros títulos Epic).
  - **Battle.net (Blizzard)**: Leitura de `Battle.net.config` (`%APPDATA%\Battle.net`) e banco `C:\ProgramData\Battle.net\Agent\product.db`, lançando diretamente via `Battle.net.exe --exec="launch <Uid>"` (*Diablo IV*, *Call of Duty: Warzone / BO6*, *Diablo III*, *Overwatch 2*).
  - **Riot Games**: Detecção automática de *League of Legends* (`C:\Riot Games\League of Legends\LeagueClient.exe`).
  - **EA Games / Origin**: Varredura em `C:\Program Files\EA Games` (*Need for Speed*).
  - **Standalone / PC Ports**: Varredura inteligente em `C:\Games` e `%LOCALAPPDATA%\Programs` (*Need for Speed: Underground 2*, *Hytale*, *Pokémon Brilliant Diamond* Unity PC, *Pokémon Legends: Z-A* PC Port).

---

## [0.8.0] - 2026-11-04 — Save Backup Vault & Automatic Playtime Tracker
### Added
- **Cofre de Backups de Save (`/api/backup-save` + Botão `🛡️ Backup`)**:
  - Cria snapshots datados (`backups/<gameId>/< timestamp >_<arquivo>`) com 1 clique diretamente no Card do Jogo.
- **Rastreador Automático de Tempo de Jogo (`totalPlayMinutes` & `sessionsPlayed`)**:
  - Contabiliza automaticamente a duração de cada sessão iniciada pelo launcher e persiste no `games-db.json`.

---

## [0.7.0] - 2026-11-04 — Real-Time Save Watcher (`mtime` Signature Polling)
### Added
- **Atualização Automática de Save sem Reiniciar (`computeSaveSignature` + `/api/status`)**:
  - O servidor calcula uma assinatura leve (`mtime:size`) de todos os saves ativos das pastas de GBA, NDS, Switch (`Ryujinx` / `Eden`) e PC Ports.
  - O frontend verifica alterações a cada 2 segundos e no evento `window.focus`, recarregando o Trainer Card instantaneamente assim que você salva no jogo.

---

## [0.6.0] - 2026-11-04 — Universal Game Status & Character Inspector (41/41 Games)
### Added
- **Inspector de Personagem para *RuneScape: Dragonwilds* (`RUNE.json` + `Banzak World.sav`)**:
  - Exibe nome do personagem (`RUNE`), número de saves (`Save #71`), tempo de jogo (`3h 22m`), HP, Stamina, Carga Especial e as 10 Skills ativas com XP total (`10.748 XP`).
- **Inspector Binário para *Pokémon Brilliant Diamond* (`SaveData.bin`)**:
  - Lê o save Unity (`0x79bb4` `MyStatus` e `0x14098` Party `PB8`), exibindo o treinador `Banzak` e seu `Turtwig Lv. 5`.
- **Card Universal de Status e Save (`cardType: 'universal'`)**:
  - Todos os 41 jogos da biblioteca agora exibem um card rico de 6 slots com saúde da instalação, localização real do save (Local / Switch NAND / Steam Cloud / Battle.net Cloud), última atividade e sessões.

---

## [0.5.0] - 2026-11-04 — Pokémon Legends: Z-A (`SwishCrypto` + `PA9`) & Switch ⇄ PC Sync
### Added
- **Desencriptador `SwishCrypto` (`SCBlock` + `SCXorShift32` com `popcount32(key)`)**:
  - Lê o arquivo `main` (3.093.124 bytes) de *Pokémon Legends: Z-A* tanto no **Port Nativo de PC** (`save_0/main`) quanto nos emuladores **Ryujinx** e **Eden**.
  - Extrai `MyStatus` (`0xe3e89bd1`), `PlayTime` (`0xce3af8f2`) e os 6 Pokémon da equipe no formato `PA9` (`0x3aa1a9ad`).
- **Sincronização 1-Clique (`Switch ⇄ PC Port` via `/api/sync-save`)**:
  - Permite copiar o save entre o Port de PC e o Emulador de Switch com backup `.bak` automático.

---

## [0.4.0] - 2026-11-04 — Pokémon Gen 4 NDS Save Inspector (`.dsv` / `.sav`)
### Added
- **Motor de Desencriptação Gen 4 (`parseGen4SaveFile`)**:
  - Compatível com *Pokémon SoulSilver*, *HeartGold*, *Diamond*, *Pearl* e *Platinum* (incluindo arquivos `.dsv` do DeSmuME/MelonDS).
  - PRNG Linear Congruential (`0x41C64E6D`) para desencriptar os 4 blocos de 32 bytes e status de batalha de cada Pokémon.

---

## [0.3.0] - 2026-11-04 — Pokémon Gen 3 GBA Save & SaveState Inspector (`.sav` / `.sgm` / `.ss1`)
### Added
- **Motor de Desencriptação Gen 3 (`parseGen3SaveFile`)**:
  - Compatível com *Pokémon FireRed*, *LeafGreen*, *Ruby*, *Sapphire* e *Emerald*.
  - Suporta tanto Battery Saves (`.sav` de 128 KB) quanto SaveStates compactados em GZip do VisualBoyAdvance-M (`.sgm` / `.ss1`), extraindo a Work RAM (`WRAM`) em tempo real.

---

## [0.2.0] - 2026-11-04 — Smart Cover Engine (Zero API Keys) & Standalone Modals
### Added
- **Busca Inteligente de Capas (`fetchSmartCover`)**:
  - Integração automática com **DekuDeals CDN** (Switch / Switch 2), **Libretro Thumbnails CDN** (GBA / NDS / PS2) e **Steam Store API** (PC / Multi-lojas) sem necessidade de chaves de API.
- **Modais Standalone de Jogos e Emuladores**:
  - Qualquer usuário pode adicionar/editar jogos, cadastrar novos emuladores e selecionar arquivos via janela nativa do Windows (`System.Windows.Forms.OpenFileDialog`).

---

## [0.1.0] - 2026-11-04 — Core Console UI, Direct Fullscreen Launch & Gamepad Hot-Plug
### Added
- Interface estilo Console / SteamOS / Switch com áudio procedural WebAudio API.
- Suporte completo ao controle **8BitDo Ultimate** com reconexão automática ao tirar da dock (`Gamepad API`).
- Abertura direta do jogo em tela cheia sem parar na tela de configuração do emulador.
