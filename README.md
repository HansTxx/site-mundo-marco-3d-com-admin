# Mundo do Marco 3D — versão 23.0 com gerenciamento de produtos

Comece pelo [guia de produtos](LEIA-ME-PRODUTOS.md) para instalar esta versão, preservar os dados e usar o novo painel.

## Iniciar no computador

1. Instale Node.js (versão 18 ou superior; prefira uma versão LTS ainda mantida).
2. Extraia o ZIP e abra o terminal na pasta que contém server.js e package.json.
3. Copie o .env da instalação anterior, ou crie-o a partir do .env.example, e preencha ADMIN_USER e ADMIN_PASSWORD. Não há uma senha padrão.
4. Escolha uma senha exclusiva e longa (pelo menos 16 caracteres). Coloque o valor entre aspas se houver espaços ou #. Exemplo de formato: ADMIN_PASSWORD="sua senha exclusiva aqui". Não use esse exemplo como senha.
5. Execute npm ci e depois npm start. O pacote não inclui node_modules; npm ci instala as dependências do arquivo de versões.
6. Abra http://localhost:3000 para a loja e http://localhost:3000/admin para o painel. Não abra o index.html diretamente pelo explorador de arquivos.

Se não existir .env, copie .env.example para .env e preencha também WHATSAPP_NUMBER (DDI + DDD + número, apenas dígitos), CEP_ORIGEM e a configuração da SuperFrete. Sempre reinicie o servidor após mudar o .env.

ADMIN_USER e ADMIN_PASSWORD servem apenas para iniciar a conta comum se ainda não existir admin-account.json. Após a migração, o arquivo privado passa a definir o acesso. MASTER_USER e MASTER_PASSWORD configuram o acesso mestre. Veja o guia da versão 21.0 abaixo.

## Como os pedidos funcionam

- O cliente preenche seus dados, calcula e seleciona o frete e clica em Finalizar pedido.
- O servidor valida os campos, consulta o catálogo para os preços dos produtos, recalcula subtotal e total e grava o pedido antes de abrir o WhatsApp.
- O registro contém nome, e-mail, telefone, endereço completo, complemento, CEP, produtos, quantidades, valores unitários, subtotal dos itens, subtotal geral, opção/identificação/prazo/valor do frete, total, número sequencial e data/hora do servidor.
- A mensagem do WhatsApp é montada a partir do registro salvo. O número da loja continua vindo de WHATSAPP_NUMBER. Como no projeto original, esse número precisa estar configurado para finalizar.
- Se a gravação falhar, o pedido não segue para o WhatsApp e os dados permanecem disponíveis para tentar novamente. A mesma tentativa é reaproveitada na aba após recarregar a página, evitando duplicação por clique repetido ou perda de resposta. Se o navegador impedir sessionStorage, a proteção de reenvio dura até recarregar a página.
- Após salvar, o botão Abrir WhatsApp permite reabrir a mensagem, inclusive se o navegador bloquear a nova aba. Use Fazer outro pedido para iniciar uma nova compra intencional, mesmo com os mesmos itens e dados.
- O painel mostra os pedidos do mais antigo para o mais recente, com atualização manual ou a cada 30 segundos enquanto estiver visível. Horários aparecem no fuso de Brasília; o arquivo armazena UTC.
- O registro indica uma solicitação recebida no site. Não confirma envio da mensagem pelo cliente, pagamento ou contratação de frete. O valor da opção de frete é recebido do navegador e validado quanto ao formato/limites; confira a cotação antes de cobrar ou contratar a entrega.

## Segurança do acesso

A sessão usa um identificador aleatório de 256 bits, guardado em cookie HttpOnly e SameSite=Strict, com validade absoluta de 8 horas. O cookie fica restrito às rotas administrativas. Há limitação de tentativas de login, verificação de origem nas operações de escrita e proteção contra incorporação do painel em outros sites. Dados de clientes são inseridos na página como texto, sem executar HTML.

As sessões ficam na memória do processo. Sair invalida a sessão atual; reiniciar o servidor invalida todas. Para trocar o acesso comum, use Minha conta. Para trocar o acesso mestre, altere MASTER_USER/MASTER_PASSWORD no .env e reinicie. O endpoint que lista pedidos exige sessão válida; a tela pública de login não contém pedidos nem credenciais.

## Hospedar com HTTPS

Configure NODE_ENV=production na hospedagem. Isso exige HTTPS no login e ativa Secure no cookie. Se houver exatamente um proxy reverso confiável entre o navegador e o Node, configure TRUST_PROXY=1 e faça esse proxy encaminhar corretamente X-Forwarded-Proto. O processo Node deve ficar acessível somente por esse proxy. Sem proxy, mantenha TRUST_PROXY=0; a terminação TLS precisa fornecer uma conexão segura à aplicação. Não use development para acesso público.

Use uma única instância/processo Node para este armazenamento JSON: sem cluster, múltiplas réplicas ou dois servidores apontando para os mesmos arquivos. Esta versão é destinada a uma loja pequena. Para mais volume ou várias instâncias, migre o armazenamento e as sessões para um serviço compartilhado.

Os pedidos precisam de disco persistente. Em hospedagens que apagam arquivos em reinícios/deploys, monte um volume permanente e configure DATA_DIR com seu caminho absoluto, fora da pasta public. Não publique .env, data ou backups em um servidor de arquivos e não compartilhe este ZIP publicamente: ele preserva o .env original da loja.

## Arquivo de pedidos e backup

Por padrão o primeiro pedido cria data/pedidos.json. DATA_DIR permite alterar a pasta. Ela deve ser privada e permitir leitura/escrita pelo processo Node.

A gravação usa uma fila para serializar pedidos concorrentes, escreve um arquivo temporário no mesmo diretório, sincroniza o conteúdo no disco e substitui o arquivo por renomeação. Antes de cada gravação é salvo pedidos.json.bak com a versão anterior. Um JSON ilegível não é substituído por uma lista vazia: o sistema retorna erro para permitir recuperação. O painel permite exclusão de pedidos com confirmação; veja as instruções de gerenciamento abaixo.

Faça backups periódicos externos da pasta de dados. O .bak automático contém apenas a versão imediatamente anterior e pode não conter o último pedido; ele não substitui backups externos. Não apague a pasta data ao atualizar o projeto.

Para recuperar: pare o servidor, copie os arquivos atuais para uma pasta de segurança, verifique o conteúdo do backup, copie pedidos.json.bak para pedidos.json e reinicie. Confira a numeração e reconcilie pedidos posteriores ao backup com os registros da loja. Nunca edite/restaure os arquivos com o servidor em execução. Falhas de disco/sistema ainda exigem backup; a troca por renomeação depende do sistema de arquivos local.

## Frete e catálogo

A integração SuperFrete foi mantida. DEMO_MODE=true usa valores de demonstração; DEMO_MODE=false usa SUPERFRETE_TOKEN e os demais parâmetros existentes. Não use cotações de demonstração para cobrar frete real.

O catálogo agora tem uma fonte única em public/produtos.json, usada pela vitrine e pelo servidor. Edite produtos, preços, imagens e dimensões nesse arquivo e reinicie o servidor. A rota /produtos.js entrega esse catálogo ao navegador. As imagens, o rodapé e o restante do visual original foram preservados.

## Verificação

Execute npm test. A suíte verifica gravações simultâneas, persistência ao reabrir o armazenamento, backup, recusa de arquivo corrompido, autenticação, HttpOnly/SameSite, bloqueio de origem externa, pedidos sem sessão, validação de dados, totais calculados no servidor, reenvio sem duplicação, logout, limitação de login e cotação demonstrativa. Os testes usam diretórios temporários e não fazem chamadas à SuperFrete real.

Também foram conferidos no navegador o login, a apresentação de um pedido no painel e a finalização no carrinho, com a mensagem do WhatsApp baseada no registro salvo. Credenciais e pedidos usados nos testes são isolados e não acompanham a pasta de dados do pacote.


## Gerenciar pedidos — novidades da versão 14.0

- **Alterar pedido:** abre um formulário com cliente, contato, endereço, itens, quantidades, preços, frete e observações. Permite adicionar itens personalizados e remover itens. O pedido precisa manter ao menos um item. Subtotal e total são recalculados automaticamente, também no servidor. Número e data de entrada são preservados para manter o histórico e a ordem de chegada.
- **Editar observações:** abre o mesmo formulário diretamente no campo de observações internas (até 5.000 caracteres). Clique em Salvar alterações para gravar. Pode editar esse campo mesmo após finalizar. As observações aparecem no cartão administrativo e não são incluídas na mensagem do WhatsApp.
- **Finalizar pedido:** marca como Finalizado e registra a data/hora. O pedido permanece na lista, na mesma posição. Essa ação é apenas uma marcação administrativa: não cobra, envia mensagem ou contrata frete. O botão passa a ser Reabrir pedido, permitindo desfazer a finalização.
- **Deletar pedido:** pede confirmação antes de remover o pedido da lista. Não há lixeira no painel. O arquivo principal mantém somente um marcador técnico da exclusão, sem os dados do cliente/itens, para não reutilizar números nem recriar o pedido em uma tentativa antiga do navegador. Backups anteriores podem conter os dados excluídos e precisam ser protegidos.

Alterações, finalizações e exclusões usam a mesma fila de gravação e substituição de arquivo com backup. As novas rotas exigem sessão administrativa e verificação de origem. Pedidos antigos funcionam sem migração manual. Os pedidos e as configurações recebidos no ZIP foram preservados; os testes usam dados separados.

Se duas janelas tentarem alterar o mesmo pedido, a segunda gravação será recusada para evitar sobrescrever uma mudança recente. Nesse caso, copie qualquer texto que queira reaproveitar, feche o formulário, atualize a lista e abra o pedido novamente. A atualização automática fica pausada enquanto o formulário estiver aberto, para preservar o que você está digitando.

As edições afetam o registro administrativo. Mensagens que já tenham sido enviadas pelo WhatsApp não são alteradas automaticamente. Mudar um item no pedido também não modifica o catálogo da loja.

### Atualização e testes

Pare o servidor antes de substituir os arquivos e reinicie com npm start. Preserve seu .env e a pasta data mais recentes: se recebeu novos pedidos depois de gerar o ZIP enviado, use os arquivos de dados atuais da loja em vez da cópia deste pacote. Faça uma cópia de segurança antes da atualização.

npm test também verifica alteração com recálculo, observações após finalizar, reabertura, exclusão, autorização, proteção contra conflitos e sequência de numeração após excluir. A edição e a finalização foram verificadas no navegador usando somente pedidos de teste.

## Versão 15.0 — abas por situação

O painel agora possui três abas, com contadores:
- Em andamento: pedidos novos e pedidos antigos com status aberto ou sem status.
- Finalizados: pedidos marcados como finalizados.
- Reabertos: pedidos reabertos a partir desta versão, com status próprio salvo no servidor.

Ao finalizar um pedido, ele sai da aba atual e aparece em Finalizados. Ao reabrir, sai de Finalizados e aparece em Reabertos. O painel seleciona automaticamente a aba de destino. Um pedido reaberto pode ser finalizado novamente. Em cada aba a ordem de entrada original é mantida. Edição, observações e exclusão continuam disponíveis nas três abas.

As situações ficam salvas no JSON e continuam após reiniciar o servidor. Ao entrar no painel ou recarregar a página, a aba inicial é Em andamento; use as demais abas para consultar seus pedidos. Pedidos que já haviam sido reabertos em versões anteriores foram salvos como aberto e permanecem em Em andamento, pois a versão anterior não distinguia essa situação.

Esta entrega foi preparada a partir da pasta 15.0 informada. O .env e os arquivos de pedidos dessa pasta foram preservados. Ao instalar, pare o servidor e mantenha seu .env e sua pasta data atuais se tiver recebido pedidos ou alterado configurações depois desta cópia. Reinicie com npm start e recarregue o painel. As abas e as transições foram verificadas no navegador com dados de teste isolados; a suíte npm test também passou.

## Versão 16.0 — Em produção

O painel agora tem quatro abas: Em andamento, Em produção, Finalizados e Reabertos.

O botão Em produção aparece nos pedidos em andamento e reabertos. Ao clicar, o status é salvo no servidor e o painel abre automaticamente a aba Em produção. A aba mostra seu contador e mantém a ordem original de entrada. Pedidos em produção continuam permitindo edição, observações, exclusão e finalização. Ao finalizar, seguem para Finalizados; ao reabrir um finalizado, seguem para Reabertos e podem entrar em produção novamente.

Pedidos e configurações do ZIP recebido foram preservados. Ao atualizar, pare o servidor, preserve seu .env e a pasta data mais recentes, substitua o código e reinicie. Recarregue o painel para carregar a nova aba. Não substitua pedidos recentes pela cópia de dados do pacote.

A transição foi conferida no navegador com dados isolados. npm test passou incluindo persistência do status, edição durante produção, finalização e bloqueio de operação sem login.


## Versão 17.0 — observações em negrito
O conteúdo das observações internas agora aparece em negrito no cartão do pedido e no campo de edição, em todas as abas administrativas. As observações já salvas recebem o mesmo destaque automaticamente. A alteração é apenas visual.



## Fechar o carrinho clicando fora
Com o carrinho aberto, clicar ou tocar na área escurecida fora dele fecha o carrinho e volta à loja. Clicar nos campos e botões dentro do carrinho continua funcionando normalmente. Os itens e dados preenchidos são mantidos; o botão X também continua disponível.


## Versão 18.0 — observações do cliente no carrinho

O carrinho possui três campos opcionais: Cor - Suporte da munição; Cor/Personalização - Tampa da caixa; Cor - Trava. Cada campo aceita até 1.000 caracteres e vale para o pedido. Quando houver mais de uma caixa com personalizações diferentes, o cliente pode identificar cada caixa no texto.

Os textos são recuperados ao reabrir/recarregar o carrinho, salvos no servidor com o pedido e incluídos na mensagem do WhatsApp. Fazer outro pedido limpa esses três campos para iniciar uma nova personalização. A gravação valida o tipo e o tamanho dos textos; campos vazios são permitidos.

No painel, aparecem em negrito na seção Observações do cliente e podem ser alterados no formulário do pedido, inclusive após finalizar. As Observações internas continuam separadas e não são enviadas pelo WhatsApp. Pedidos anteriores sem esses campos mostram Não informado e continuam editáveis. Alterações administrativas não modificam mensagens de WhatsApp já enviadas.

Os dados, configurações, CPF, fotos e demais funcionalidades recebidos foram preservados. Ao atualizar, mantenha seu .env e a pasta data mais recentes, reinicie o servidor e recarregue o navegador. A suíte npm test passou; foram conferidos no navegador os campos do carrinho, a recuperação dos textos e a exibição no painel usando dados isolados de teste.

## Versão 19.0 — limpar carrinho após registrar o pedido

Após o servidor confirmar que o pedido foi salvo, o carrinho limpa automaticamente os produtos, quantidades, as três observações de cores/personalização e as opções de frete. Os dados do cliente (nome, e-mail, telefone, CPF, endereço, complemento e CEP) permanecem preenchidos e salvos no navegador.

O pedido completo permanece no painel administrativo. A mensagem de WhatsApp é gerada antes da limpeza e o link Abrir WhatsApp continua disponível na confirmação, inclusive quando uma nova aba é bloqueada. A limpeza ocorre após registrar o pedido no site: o site não consegue detectar quando o cliente efetivamente toca em enviar dentro do WhatsApp.

Se houver erro ou a confirmação do servidor não chegar, os itens e as observações permanecem para tentar novamente. Após o sucesso, a chave da tentativa anterior também é removida, permitindo uma nova compra intencional.

Validação: npm test passou com 7 testes, incluindo confirmação de sucesso, preservação dos dados do cliente ao recarregar, link de WhatsApp após a limpeza e manutenção do carrinho em caso de falha. Dados de teste não acompanham a pasta data.

Ao atualizar, preserve seu .env e a pasta data mais recentes, reinicie o servidor e recarregue o site.


## Versão 21.0 — Minha conta e acesso mestre

### Ativar pela primeira vez

1. Preserve seu .env e sua pasta data atuais ao atualizar o código. Os pedidos existentes não precisam de migração.
2. No .env, preencha MASTER_USER e MASTER_PASSWORD com seu login mestre exclusivo e uma senha longa, diferente da senha comum. Os campos foram incluídos vazios: não há senha mestre padrão. Use um usuário diferente de ADMIN_USER. Use aspas se a senha contiver # ou espaços. Configure isso uma vez e reinicie o servidor. Na hospedagem pública, mantenha HTTPS e NODE_ENV=production conforme as instruções acima.
3. Entre em /admin com seu acesso comum já existente. No primeiro login correto, o servidor cria data/admin-account.json, ou esse arquivo dentro de DATA_DIR, com usuário, salt aleatório e hash scrypt da senha. A senha original não é salva nesse JSON.
4. Alternativamente, entre como mestre, abra Minha conta e defina diretamente o usuário e a senha comuns. Isso também cria o arquivo privado, dispensando o login inicial comum.
5. Depois de confirmar que o novo login comum e o mestre funcionam, remova ADMIN_USER e ADMIN_PASSWORD do .env e reinicie. Eles não são mais necessários após a criação do arquivo. Enquanto esse arquivo existir, alterar ADMIN_PASSWORD no .env não muda a senha comum.

Se deixar MASTER_USER ou MASTER_PASSWORD vazio, o acesso mestre fica desativado; o administrador comum continua funcionando. Não compartilhe o .env com quem deve ter somente acesso ao painel.

### Administrador comum

O botão Minha conta permite alterar o próprio usuário e a senha informando a senha atual, nova senha e confirmação. A senha nova precisa ter entre 12 e 200 caracteres; o usuário, de 3 a 80 caracteres, sem espaços (letras, números, ponto, hífen, sublinhado e @). Ao salvar, todas as sessões do administrador são encerradas, incluindo a atual. Entre novamente com o novo acesso. O administrador não pode ver nem alterar as credenciais mestre.

### Mestre

Use a mesma página /admin com MASTER_USER e MASTER_PASSWORD. Você pode gerenciar os pedidos e abrir Minha conta para criar/redefinir o usuário e a senha do administrador, confirmando sua própria senha mestre, sem precisar da senha dele. A redefinição encerra as sessões comuns e mantém a sessão mestre. A senha mestre nunca é alterada por esse formulário.

### Armazenamento, segurança e recuperação

admin-account.json fica fora da pasta public. Inclua-o no backup privado da pasta data e preserve-o em atualizações. O servidor serializa as alterações e grava por arquivo temporário sincronizado seguido de renomeação. Uma falha na escrita não confirma a troca. Não são criados backups automáticos de senhas antigas; faça backups privados da pasta com o servidor parado. O conteúdo não aparece nas rotas públicas nem nas respostas de conta.

Use um único processo Node e disco persistente, como já exigido para os pedidos. Cookies continuam HttpOnly/SameSite, com Secure em produção. A troca exige sessão, confirmação da senha atual e origem válida; tentativas são limitadas. A revisão da conta é verificada nas sessões comuns, inclusive quando uma troca coincide com outro login. Mudanças já em execução antes da troca podem terminar; novas requisições com sessões revogadas são recusadas.

Não apague admin-account.json para trocar senha. Se o arquivo desaparecer e os antigos ADMIN_USER/ADMIN_PASSWORD ainda estiverem configurados, o acesso inicial poderá ser criado novamente. Se o JSON estiver corrompido, ele não é substituído automaticamente nem há retorno às credenciais antigas: pare o servidor e restaure uma cópia válida e privada. Para simples esquecimento de senha, use o mestre pelo painel.

O controle de permissões vale para o painel: alguém com acesso aos arquivos ou ao servidor pode modificar a configuração, portanto restrinja esse acesso ao dono da loja.

### Validação

npm test passou com 8 testes, incluindo migração, ausência de senha em texto aberto, troca própria, senha atual incorreta, tentativa de usar o nome mestre, recuperação pelo mestre, persistência após nova leitura, revogação das sessões, bloqueio de origem externa, erro de escrita e JSON corrompido. A entrada do mestre e a apresentação do formulário foram conferidas no navegador com configurações de teste isoladas. Nenhuma credencial de teste foi inserida no .env entregue.

## Limite de login atualizado

O login agora conta somente respostas de credenciais incorretas. Um login correto zera o contador de falhas do IP. Após 10 falhas sem um login bem-sucedido, novas tentativas são bloqueadas até terminar a janela de 5 minutos, contada da primeira falha. Reiniciar o servidor zera os contadores em memória. Verificações simultâneas também são limitadas enquanto estão em processamento. Erros internos do servidor não contam como senha incorreta.

O ajuste vale para a entrada de administrador e mestre. O limite separado para alterações de conta permanece como antes. Testado com mais de 10 logins corretos, zeragem após falhas e bloqueio após 10 falhas.

Para aplicar apenas esta correção em uma instalação da versão 21.0 com Minha conta, substitua lib/admin.js e reinicie o servidor. Preserve seu .env e a pasta data atuais (incluindo admin-account.json). O ZIP completo contém a base da última versão preparada nesta conversa, não alterações locais posteriores.
