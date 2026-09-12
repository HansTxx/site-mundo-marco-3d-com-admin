# Versão 23.0 — gerenciamento do catálogo

## Instalar e usar

1. Extraia o ZIP em uma nova pasta. Copie o `.env` da instalação anterior para esta pasta; ele não acompanha o novo pacote. Para uma instalação nova, copie `.env.example` para `.env` e preencha os acessos e a configuração da loja.
2. Preserve a pasta `data` da instalação em uso (pedidos e conta administrativa). Faça uma cópia de segurança antes de atualizar. Se usa `DATA_DIR`, mantenha o mesmo diretório. O pacote preserva os dados recebidos no ZIP original, mas eles podem estar desatualizados em relação ao servidor em uso.
3. Na pasta que contém `package.json`, execute `npm ci` e depois `npm start`.
4. Acesse `http://localhost:3000/admin`, entre com seu acesso e clique em **Produtos → Novo produto**. Preencha os campos, envie as fotos e clique em **Salvar produto**.
5. Para alterar qualquer produto, clique em **Editar**. A primeira foto é a capa; use **Mover para cima/baixo** e **Remover imagem**. A loja recebe os produtos ao abrir a página e verifica alterações a cada 30 segundos enquanto está visível.

## Campos e imagens

- Preço em reais, dimensões em centímetros e peso em quilogramas. Informe valores positivos. Preço e dimensões aceitam 2 casas decimais; peso, 3. Limites: R$ 100.000 e 1.000 por dimensão/peso.
- Nome e descrição são obrigatórios. Use de 1 a 20 fotos PNG, JPG, WEBP ou GIF, até 4 MB cada. O servidor guarda os arquivos enviados; a publicação ocorre ao salvar o produto.
- A exclusão remove o produto do catálogo público e mantém os pedidos antigos. Fotos removidas do produto continuam no armazenamento para não quebrar referências e backups.

## Persistência e migração

Os produtos originais e suas cinco fotos são preservados. O ZIP já inclui o catálogo completo em `data/produtos.json` (ou `DATA_DIR/produtos.json`). Se o arquivo não existir, o servidor o cria automaticamente ao iniciar, sem exigir uma edição no painel. Um catálogo existente em data é sempre preservado. Para futuras atualizações, copie a pasta data inteira da sua instalação por cima da pasta data do pacote novo. A fonte inicial `public/produtos.json` permanece intacta como referência de migração. Depois da migração, use o painel para editar.

O servidor serializa as gravações, sincroniza o arquivo temporário e faz substituição por renomeação, mantendo a versão anterior em `produtos.json.bak`. Edições concorrentes do mesmo produto são rejeitadas por revisão. Arquivos corrompidos não são substituídos por um catálogo vazio. Para restaurar, pare o servidor e recupere um backup válido.

Faça backup de toda a pasta `data`, incluindo `imagens`, `produtos.json`, pedidos e conta. Execute apenas **um processo Node** escrevendo nesse diretório. Ele precisa ser persistente e permitir gravação pelo usuário do servidor. No Docker, preserve o volume existente e confira as permissões da pasta montada para o usuário `node`.

## Frete e hospedagem

O navegador envia somente os IDs e quantidades ao calcular frete. O servidor consulta o catálogo salvo, soma o peso e o valor dos itens, usa a maior largura e comprimento e soma as alturas multiplicadas pelas quantidades. Isso representa uma única caixa com itens empilhados, sem otimização de encaixe nem margem automática para embalagem. Informe medidas/peso adequados ao envio e confira a embalagem final; a transportadora pode recusar uma caixa acima dos seus limites. Aumentar a quantidade aumenta peso e altura da cotação.

`DEMO_MODE=true` usa valores de demonstração. Para cotar de verdade, use `DEMO_MODE=false`, `CEP_ORIGEM`, `SUPERFRETE_TOKEN` e as demais configurações existentes no `.env`. Tokens e senhas ficam somente no servidor.

Este projeto precisa do backend Node e de armazenamento persistente; enviar apenas os arquivos estáticos ao Netlify não executa o admin nem persiste o catálogo. O Nginx incluído foi ajustado para receber as imagens. Em produção, mantenha HTTPS e configure o proxy conforme o README.

## Verificação

Execute `npm test`. Os testes cobrem autenticação, validação, migração, gravações concorrentes, backup, edição, exclusão, upload, exibição pública, reinício do servidor e os dados enviados à SuperFrete usando um servidor simulado. Também foram realizados testes no navegador: criação, edição de produtos novos e antigos, upload múltiplo, ordenação/remoção de fotos, carrossel, carrinho, frete demonstrativo e visual desktop/celular, sem erros JavaScript. A cotação real na conta SuperFrete não foi executada.
