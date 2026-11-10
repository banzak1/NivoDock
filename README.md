# NivoDock

Launcher para Windows com interface de console, bibliotecas de várias lojas, emuladores, capas e leitores de saves. O pacote standalone inclui Node.js: o jogador não precisa instalar Node, NPM ou Python.

## Usar o pacote standalone

1. Baixe o ZIP para Windows x64 na seção **Releases** do GitHub e extraia em uma pasta com permissão de escrita.
2. Abra `NivoDock.exe`. O instalador `Instalar-NivoDock.exe` é opcional e cria atalhos em uma pasta escolhida por você.
3. Aguarde a verificação inicial. O Deck consulta as lojas, as bibliotecas adicionais e os locais comuns de jogos/emuladores. As capas são preenchidas em segundo plano.

A aba Todos e as abas de plataforma mostram jogos com instalação confirmada. A aba **Histórico** reúne ausentes, incompletos e não verificados. Favoritos, saves e tempo jogado continuam guardados quando um jogo é desinstalado.

A opção **Gerenciar → Verificar instalações** atualiza o estado; também há verificação ao abrir e a cada 90 segundos. Uma unidade desconectada ou sem acesso gera estado não verificado. Reconectar/reinstalar permite reencontrar o jogo sem zerar o histórico.

Para locais personalizados, abra **Gerenciar → Emuladores e pastas → Adicionar local de jogos**. Você também pode cadastrar um jogo ou emulador manualmente. A descoberta de executáveis standalone cobre os títulos suportados; ela não classifica qualquer programa do PC como jogo.

## Cards de progresso por jogo

Cada jogo cadastrado recebe um card com origem e estado de suporte claros. Pokémon mantém treinador/equipe; Dragonwilds, Skyrim, Hytale, No Man’s Sky, Megabonk e Vampire Survivors possuem leitores locais específicos. Há formatos diferentes para Minecraft Java e Bedrock. Na biblioteca validada, 16 registros têm progresso legível; os demais mostram resumo básico ou o limite encontrado.

No card, navegue por Resumo, Habilidades/Personagens, Equipamento e Sobre os dados quando houver conteúdo. Escolha perfil/personagem ou arquivo manual; **Usar mais recente** restaura o modo automático. Uma seleção explícita inacessível não muda para outro personagem. A atualização reflete a gravação do save, não a partida em memória.

**Gerenciar → Compatibilidade dos cards** lista todos os jogos e os dados realmente interpretados. Veja a [matriz de compatibilidade e limites](docs/COMPATIBILIDADE-PROGRESSO.md). Níveis estimados por XP/500, progresso derivado de SaveCount e afirmações genéricas de Steam Cloud foram removidos. Habilidades/equipamento de Skyrim e diversos formatos ainda aguardam leitura específica; não há promessa de decodificar qualquer save.

Nenhum save é enviado ou editado pelo leitor. A escolha de perfil é persistida no catálogo local; a ação opcional Copiar arquivo faz somente a cópia indicada, sem equivaler a backup completo de jogos com múltiplos arquivos. Saves reais não são incluídos no pacote.

## Atualizações do aplicativo

**Gerenciar → Atualizações do NivoDock** mostra versão, novidades, progresso, **Baixar e instalar** e **Depois**. Com o canal publicado/configurado, a consulta ocorre ao abrir e a cada seis horas. Não instala silenciosamente: a instalação depende da confirmação. Uma sessão de jogo acompanhada pelo NivoDock adia a aplicação, inclusive se o jogo começar durante o download.

A v1.5.0 implementou o atualizador; a v2.0 o mantém, mas **a hospedagem ainda não foi escolhida**: este pacote informa que as atualizações online ainda não foram publicadas. Para ativar o canal nos PCs dos amigos, o responsável configura a URL, gera/distribui o pacote com esse endereço e publica o manifesto assinado e o ZIP. Quem tem v1.4.0 precisa instalar esse pacote inicial manualmente. Não existe um servidor público de versões provisionado por esta mudança.

O atualizador verifica a assinatura RSA do manifesto, o SHA256 do ZIP e os arquivos internos. Preserva biblioteca/configuração/perfil/cache/saves, mantém uma versão anterior e faz retorno automático se a nova versão não responder à verificação de inicialização. O inicializador também recupera uma transação interrompida antes de abrir a janela. Não apague `.updates/` enquanto houver atualização ou recuperação em andamento.

O ZIP manual e o OTA usam a mesma release completa e o mesmo número de versão. Atualização por delta e instalador online continuam para uma etapa futura. Procedimento de hospedagem/assinatura: [Publicar atualizações](docs/PUBLICAR-ATUALIZACOES.md).

## Recursos

- Steam com bibliotecas adicionais, Epic, Battle.net, Riot, EA, GOG e instalações desktop identificadas por `MicrosoftGame.config`; confirmação dos arquivos de cada jogo, em vez de confiar apenas no cliente ou em registros residuais.
- Emuladores com ROMs, abertura direta e controle por teclado/gamepad.
- Capas por identidade exata, cache offline, atualização por jogo e proteção de imagens manuais.
- Leitores de saves Pokémon GBA/DS, Legends Z-A e Brilliant Diamond, personagem RuneScape: Dragonwilds e informações universais dos demais títulos.
- Backups e sincronização selecionados pelo usuário; verificações de instalações não alteram saves.
- Busca sem acentos, edição que preserva preferências e API restrita ao acesso local.

Dados do usuário: `games.json`, `config.json`, `.deck-profile/`, `backups/`, recuperação em `.updates/` e o cache `public/artwork/`, ao lado do aplicativo. O instalador preserva o catálogo e a configuração existentes. Não copie o catálogo de outro PC para iniciar uma biblioteca nova.

Sem conexão com a internet, a descoberta local e as capas já guardadas continuam disponíveis. Novas capas exigem conexão.

## Desenvolvimento e empacotamento

A aplicação usa apenas módulos nativos do Node. Para executar a fonte: `node server.js`; o endereço padrão é `http://127.0.0.1:47890`. Para validar: `npm test`, sem instalação de pacotes.

Geração no Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-release.ps1 -NodePath <caminho-do-node.exe>`.

Para compartilhar por um canal com limite de 20 MB por arquivo, o gerador opcional de desenvolvimento `python scripts/build-discord.py dist/NivoDock-v2.0.0-win-x64.zip` produz ZIPs menores e um preparador nativo para Windows. Python é necessário apenas no computador que gera essas partes; quem recebe usa `Preparar-NivoDock.bat`. Veja [TESTE-COM-AMIGOS.md](docs/TESTE-COM-AMIGOS.md).

O gerador atual utiliza Windows x64 Node 22.20.0 e sua licença em `vendor/node-v22.20.0-LICENSE`. Compila os inicializadores com o .NET Framework do computador de desenvolvimento. O ZIP em `dist/` contém o runtime, instalador e manifesto, com `.sha256` ao lado. A cópia expandida é descartada por padrão; `-KeepExpanded` a conserva para validação. A pasta `dist/` fica reservada aos pacotes atuais; catálogo, configuração, saves, perfis e cache pessoais ficam fora da distribuição.

`NIVODOCK_PORT` permite uma porta separada de teste. `NIVODOCK_DISABLE_AUTOSCAN=1` desativa apenas as verificações automáticas para testes controlados; o botão de verificação continua disponível.

O pacote atual usa apenas os identificadores NivoDock. Use `NIVODOCK_PORT` e `NIVODOCK_DISABLE_AUTOSCAN` nas verificações isoladas.

## Identidade NivoDock e instalação limpa

O aplicativo usa grafite e cinza, com texto branco e assinatura azul violeta. O botão Jogar e a seleção recebem o destaque principal; navegação e ações secundárias são discretas. As capas continuam coloridas e os avisos de erro/saúde mantêm cores semânticas. O acento permanece estável ao trocar de jogo. As ações Adicionar jogo, Emuladores e pastas, Atualizar capas, Verificar instalações e Iniciar com Windows estão em **Gerenciar**. O menu funciona com mouse, Enter/Espaço, Tab e Esc.

- Novo inicializador: `NivoDock.exe`; novo instalador: `Instalar-NivoDock.exe`.
- Instalação padrão em `%LOCALAPPDATA%\NivoDock`, sem busca de uma pasta de produto anterior.
- Distribuição para instalações novas: apenas `NivoDock.exe`, `Instalar-NivoDock.exe` e o runtime `node.exe`; não há inicializadores de compatibilidade com outro nome.
- O início automático utiliza somente `NivoDock.bat`/`NivoDock.lnk`. Não altera entradas de outros programas.
- O pacote leva um `LEIA-ME.txt` orientado ao jogador. Changelog, roadmap, revisões e esta documentação técnica ficam no repositório.
- Dados criados durante o uso devem ser preservados nas atualizações futuras. O instalador não substitui biblioteca/configuração existentes nem copia backups pessoais.
- Logo, símbolo e ícones: `public/brand/`; guia visual local: `http://127.0.0.1:47890/brand/index.html`. Arquivos vetoriais editáveis e PNGs de 16 a 512 pixels; ICO Windows de 16 a 256 pixels.
- A marca é independente dos jogos. Escolha do nome e arquivos de identidade não representam registro de marca ou autorização para redistribuir imagens de terceiros.

Veja o [histórico de mudanças](CHANGELOG.md), a [arquitetura](docs/ARQUITETURA.md) e o [roadmap](ROADMAP.md).

## Descoberta ampliada e organização

Registros do Windows são locais de busca, não confirmação de jogo instalado. GOG e MicrosoftGame.config precisam apontar para um executável existente; aplicativos e launchers não são classificados apenas pelo nome. Pacotes protegidos e versões diferentes podem exigir ajustes; não há promessa de reconhecer qualquer jogo do PC.

Hytale é pesquisado em Roaming/LocalAppData, pastas personalizadas, canais e diretórios de versão. O cliente e Assets.zip precisam existir; o launcher sozinho e downloads parciais não contam como prontos. A indicação de instalação não substitui a autenticação/licença do launcher oficial.

Se faltar um jogo, use Gerenciar → Emuladores e pastas → Adicionar local de jogos e selecione sua pasta instalada. A verificação informa quando algum local não pôde ser lido ou quando a busca atingiu seu limite. Jogos sem metadados reconhecidos continuam podendo ser cadastrados manualmente.

## Contribuir

Abra uma issue para relatar um problema ou propor uma melhoria. Inclua a versão do NivoDock, a versão do Windows e os passos para reproduzir. Se o problema envolver um jogo, informe o título, a edição e a loja ou o emulador. Retire caminhos pessoais de logs e capturas antes de anexá-los.

Para propor uma alteração no código, crie uma branch no seu fork, rode `npm test` e abra um pull request descrevendo a mudança e como ela foi verificada. Os testes usam dados sintéticos.

## Licença

O projeto usa a [licença MIT](LICENSE). O [runtime Node.js](vendor/node-v22.20.0-LICENSE) tem sua própria licença. Jogos, ROMs, capas e sprites de terceiros seguem os termos dos respectivos titulares.
