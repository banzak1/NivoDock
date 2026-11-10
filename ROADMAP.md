# Roadmap — NivoDock

As versões 1.1, 1.2 e 1.3 registram entregas; o refinamento visual está na 1.3.1, a distribuição limpa na 1.3.2, a descoberta ampliada na 1.4.0 e o atualizador integrado na 1.5.0, com publicação do canal pendente. As seções futuras são planos, não funcionalidades já entregues. Alterações de escopo devem ser registradas aqui e no changelog da versão correspondente.

## v1.1.0 — Capas e integridade da biblioteca

- Identificar capas pelo jogo correto, obter endereços atuais e guardar imagens localmente.
- Preservar capas manuais, metadados e alterações concorrentes.
- Corrigir busca, atalhos, edição e compatibilidade de emuladores.
- Restringir a API ao launcher local e adicionar testes de regressão.

## v1.2.0 — Descoberta standalone e instalações reais (entregue)

Pedido do usuário em 2026-11-05: implementar em versão posterior à v1.1.0.

Problema concreto: Diablo III, Diablo IV e Overwatch continuam na biblioteca após a desinstalação. Registros antigos da Battle.net e a existência de `Battle.net.exe` não comprovam que cada jogo está instalado.

### Comportamento esperado

- Descobrir lojas, bibliotecas e jogos em diferentes contas do Windows, discos e pastas de instalação.
- Usar os locais de instalação e registros fornecidos por cada loja; ler as bibliotecas adicionais da Steam e validar os manifestos Epic, EA, Riot e Battle.net.
- Confirmar os arquivos do próprio jogo e seu executável antes de marcá-lo como instalado. Diferenciar loja instalada, download incompleto, jogo instalado, instalação ausente e estado ainda não verificado.
- Fazer a reconciliação ao abrir e ao atualizar a biblioteca, sem bloquear a interface.
- Retirar jogos ausentes da contagem de instalados e da lista padrão de jogos disponíveis. Manter uma área de ausentes/histórico para não apagar favoritos, tempo jogado, saves ou configurações pessoais.
- Evitar duplicatas e readicionar jogos desinstalados a partir de manifestos antigos.
- Atualizar as capas automaticamente após confirmar a identidade do jogo; preservar escolhas manuais e usar o cache offline.
- Preparar a distribuição com runtime Node incluído e caminhos relativos. A instalação não deve exigir Node/NPM, Python, ferramentas de desenvolvimento ou chaves de API configuradas pelo usuário.

### Critérios de aceitação

1. Apenas o cliente Battle.net instalado não adiciona Diablo III, Diablo IV ou Overwatch.
2. Um registro residual com executável ausente não conta como jogo instalado.
3. Desinstalar, mover e reinstalar um jogo atualiza seu estado sem perder seu histórico.
4. Bibliotecas em outro disco e Windows com outro nome de usuário são reconhecidos.
5. Uma falha de leitura/permissão ou uma unidade desconectada gera estado não verificado, sem apagar dados.
6. Primeira execução numa máquina limpa encontra os jogos suportados, baixa as capas correspondentes e funciona offline depois.

## v1.3.0 — NivoDock e identidade visual (entregue)

- Nome, ícone e logo próprios; base grafite, cinza e branco, refinada na v1.3.1 com assinatura violeta e gestão em menu.
- Renomeação dos executáveis e pacote com compatibilidade de atalhos e dados anteriores.
- Consistência do autostart entre instalador e interface.

## v1.3.2 — Distribuição limpa para instalações novas (entregue)

- Somente executáveis e configurações com identidade NivoDock; sem aliases, flags ou reaproveitamento de pasta de produto anterior.
- Guia do jogador no pacote e documentação histórica mantida no repositório.
- ZIP e partes de Discord da versão limpa verificados com instalador, atalhos e runtime standalone.

## v1.4.0 — Descoberta ampliada e organização do projeto

Prioridade solicitada pelo usuário após os testes com amigos. Hytale foi um exemplo; a ampliação cobre fontes de descoberta em geral.

- Metadados GOG e MicrosoftGame.config, caminhos de registro/ícones e pastas personalizadas.
- Hytale com múltiplos caminhos/canais/versões e confirmação dos arquivos do jogo.
- Unicode no Windows, preservação de preferências, prevenção de duplicatas e indicações de busca incompleta.
- Organização de relatórios e builds, preservando biblioteca, configuração, perfil, capas e histórico.

## v2.0.0 — Cards de progresso por jogo (implementado com cobertura declarada)

- Card para toda a biblioteca, com suporte básico/progresso/detalhado e estados reais de leitura; preservação dos Trainer Cards Pokémon.
- Leitores locais para seis famílias PC e mundo Minecraft com edição separada. 16 registros com progresso na biblioteca validada, sem afirmar 45 leitores completos.
- Seleção persistente de personagem/perfil/arquivo, atualização por gravação, cache limitado e leitura sem edição/envio de saves.
- Remoção de métricas fictícias. Catálogo de compatibilidade e limites em [Compatibilidade](docs/COMPATIBILIDADE-PROGRESSO.md).
- Próximas extensões: habilidades/perks/equipamento Skyrim, curva de níveis Dragonwilds validada por versão, IDs de itens ainda desconhecidos, Palworld moderno e outros formatos binários, edições Pokémon adicionais e validação em outros PCs.

## Instalador online — versão futura a definir

- Um executável pequeno baixa e verifica o pacote completo e o runtime durante a primeira instalação. Isso reduz o arquivo enviado, não o total baixado.
- Hospedagem de versões, autenticidade/integridade, progresso, nova tentativa e recuperação de falhas; manter o ZIP completo para instalação offline.
- Após instalado, o funcionamento local permanece disponível. Compartilhar a infraestrutura de versões com o atualizador sem confundir instalação inicial e atualização.

## v1.5.0 — Atualizador integrado (implementado; publicação pendente)

Autorizado em 2026-11-05. Consulta ao abrir e a cada seis horas, aviso/novidades, confirmação, progresso, adiamento e reinicialização. Usa a release completa compartilhada com o download manual.

- Manifesto assinado RSA, HTTPS, checksums e validação de tamanho/caminhos/inventário.
- Trabalhador separado com runtime incluído, backup e verificação de inicialização; retorno automático se a nova versão falhar e recuperação de interrupções ao abrir.
- Preservação da biblioteca, configuração, perfil, capas e saves; bloqueio de mutações durante a instalação e adiamento de sessões acompanhadas pelo launcher.
- Ferramentas e guia em [Publicar atualizações](docs/PUBLICAR-ATUALIZACOES.md). A chave privada permanece fora do projeto.
- **Pendente externo:** escolher hospedagem e publicar o manifesto/pacote. A URL está vazia e o aplicativo comunica que o canal ainda não foi publicado. O usuário informou que ainda não tem hospedagem. Não há servidor público criado nem arquivos enviados.
- A primeira instalação do pacote com URL configurada é manual; depois ele consulta o canal publicado. Versões anteriores à v1.5 não possuem o atualizador.
- Deltas, instalador online e monetização continuam futuros; o atualizador não depende de Pro.

## Oferta comercial — etapa futura, sem cobrança nesta v2.0

Direção confirmada pelo usuário em 2026-11-05: a preparação dos painéis específicos por jogo e do catálogo de suporte deve mirar a grande v2.0. As etapas técnicas anteriores servem de base para esse marco. Preço, planos e forma de cobrança continuam por validar; a confirmação não implementa uma oferta paga. Não há cobrança, anúncios, restrições Pro ou coleta adicional de dados na v2.0.0.

- Distribuir o pacote atual para testes com amigos; depois da escolha de hospedagem, validar uma cópia com canal configurado em outros PCs, conforme [TESTE-COM-AMIGOS.md](docs/TESTE-COM-AMIGOS.md).

- Avaliar demanda com usuários antes de definir preço ou recursos pagos.
- Avaliar edições Free e Pro com a mesma versão semântica. Edição/plano comercial e número de versão são conceitos separados.
- Avaliar o Painel de Progresso específico por jogo como diferencial: leitura detalhada, histórico de evolução e comparação entre saves nos títulos suportados. Validar cobertura, custo de manutenção e disposição para pagar antes de definir preço ou restrições; não prometer compatibilidade completa com todos os jogos.
- Hipóteses: base gratuita, licença Pro com pagamento único, serviço de nuvem opcional por assinatura ou anúncios. Comparar impacto sobre experiência de console, privacidade, acesso offline e custos contínuos.
- Definir os limites de confiança da licença: recursos locais podem ser modificados; nenhuma proteção local deve ser tratada como inviolável. Estudar licenças assinadas, permissões verificadas por serviço para funções remotas, modo offline com regras explícitas e recuperação de licença.
- Revisar assinatura/verificação das atualizações, proteção de contas e backups, dependências e canais de distribuição. Não embutir segredos privados de assinatura no cliente.
- Revisar licenças de código, direitos de uso das imagens, integrações com lojas e a distribuição de componentes antes do lançamento comercial.
- Não iniciar essa implementação enquanto a biblioteca, o scanner standalone e a segurança dos saves não estiverem validados.

## Outras melhorias a avaliar

- Medir o custo do leitor de saves e reduzir releituras em bibliotecas maiores.
- Fazer a geração de pacotes e releases reproduzível, com checksums e verificação em Windows.
- Revisar os instaladores e o rastreamento de sessões de jogos iniciados por outros launchers.
