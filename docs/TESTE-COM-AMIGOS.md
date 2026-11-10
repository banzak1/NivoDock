# NivoDock v2.0.0 — teste com amigos

Pacote para **Windows x64**, destinado a teste com um grupo pequeno. Arquivo: `dist/NivoDock-v2.0.0-win-x64.zip` (aproximadamente 33 MB). Envie o ZIP completo, que inclui o instalador e os demais arquivos do aplicativo.

## Envio pelo Discord com limite de 20 MB

A distribuição alternativa está em `dist/NivoDock-v2.0.0-win-x64-discord/`:

- `NivoDock-v2.0.0-win-x64-parte-1-de-2.zip`: menos de 20.000.000 bytes.
- `NivoDock-v2.0.0-win-x64-parte-2-de-2.zip`: menos de 20.000.000 bytes.

Envie os dois ZIPs em mensagens separadas. Quem receber deve baixar ambos na mesma pasta, extrair a parte 1 e executar `Preparar-NivoDock.bat`. O preparador encontra a segunda parte, confere o SHA256 e extrai a pasta completa. Depois basta abrir `NivoDock.exe`, ou o instalador opcional dentro dessa pasta. Também funciona quando as duas partes foram extraídas na mesma pasta ou em pastas separadas com os nomes padrão do Explorer.

Não requer 7-Zip, Node/Python instalados nem download adicional. O preparador usa o PowerShell e a extração ZIP do Windows. Cada arquivo fica abaixo de 20.000.000 bytes. Os arquivos restaurados são idênticos aos da distribuição limpa **2.0.0**.

## Como usar

1. Extraia todo o ZIP em uma pasta com permissão de escrita.
2. Abra `NivoDock.exe` para usar a versão portátil. Para instalar e criar atalhos, execute `Instalar-NivoDock.exe` dentro da pasta extraída.
3. Aguarde a descoberta dos jogos suportados e o carregamento das capas. O runtime Node está incluído; não é necessário instalar Node, NPM ou Python.
4. Para pastas diferentes das lojas conhecidas, use **Gerenciar → Emuladores e pastas → Adicionar local de jogos**. Também é possível adicionar um jogo manualmente.

Internet é necessária para baixar capas novas. Capas já guardadas e os dados locais podem ser usados offline. Cada amigo começa com sua própria biblioteca; o pacote não inclui os jogos, catálogo, saves ou perfil do desenvolvedor.

## Atualizações

Em Gerenciar → Atualizações do NivoDock, a cópia sem hospedagem informa que as atualizações online ainda não foram publicadas. Não deve haver download nem reinicialização por conta própria. Depois da publicação do canal, o aviso oferece novidades, Baixar e instalar ou Depois; uma sessão acompanhada pelo aplicativo deve bloquear a instalação. Preserve .updates durante uma aplicação/recuperação.

## O que observar e relatar

- Se abriu normalmente e qual versão do Windows foi usada.
- Jogos instalados que ficaram faltando ou títulos ausentes que apareceram como disponíveis.
- Capas incorretas, falhas ao abrir um jogo, problemas de busca ou de navegação com controle.
- Em um problema de leitor de save, informar jogo/edição e o comportamento observado. Não é necessário enviar saves ou credenciais para o teste inicial.

## Escopo desta versão

É uma versão de teste, validada no computador de desenvolvimento e em cópias isoladas, ainda sem confirmação em todos os PCs. Os executáveis não têm assinatura digital. Os cards têm uma matriz explícita de suporte. Teste personagem/perfil correto, seleção manual, atualização ao salvar e preservação dos dados. Não há leitura completa para todos os formatos; veja [compatibilidade](COMPATIBILIDADE-PROGRESSO.md). Dragonwilds mostra XP real sem estimar nível; Skyrim lê cabeçalho sem prometer habilidades ou equipamento ainda não decodificados.

A preparação do painel específico por jogo, do catálogo de suporte e da possível oferta comercial mira a **v2.0**. Leitura completa de todos os formatos, nuvem e plano Pro não estão incluídos neste ZIP. O atualizador integrado está implementado, mas o canal online ainda não foi publicado; esta cópia não consulta um endereço público. O pacote com URL configurada precisa ser instalado manualmente uma vez antes de receber próximas versões.

## Integridade e identidade

Pacote limpo da v2.0.0: sem executável de compatibilidade, pasta de instalação ou configuração de produto anterior. A documentação histórica fica no repositório. Dentro do pacote, `LEIA-ME.txt` explica o uso para o jogador.

Os arquivos `.sha256` trazem os hashes do ZIP e das partes. A restauração verifica o hash antes de extrair.
