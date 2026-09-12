# Mundo do Marco 3D — atualização visual

O projeto mantém Node/Express, JavaScript e os dados originais. A atualização usa Bootstrap 5.3.8 com CSS personalizado em preto, amarelo e tons neutros. Não requer compilação do front-end nem acesso a CDN para carregar os estilos.

## Executar

1. Extraia `Mundo-do-Marco-3D-Bootstrap.zip`.
2. Abra um terminal na pasta `Mundo-do-Marco-3D-Bootstrap` e execute `npm ci`.
3. Mantenha seu `.env` existente ou copie `.env.example` para `.env` e configure os dados da loja.
4. Execute `npm start` e acesse `http://localhost:3000`. O painel continua em `http://localhost:3000/admin`.

A pasta `node_modules` não acompanha a entrega; `npm ci` instala as dependências travadas no projeto. O requisito declarado no projeto é Node.js 18 ou superior. O inicializador existente também pode ser usado depois da instalação das dependências.

Os pedidos, catálogo, imagens e arquivo de acesso existentes no ZIP original foram preservados. Se já houver uma conta salva, utilize o acesso existente. Para uma instalação nova sem conta salva, configure `ADMIN_USER` e `ADMIN_PASSWORD` conforme o README original. Nenhuma credencial de teste acompanha a entrega.

## Atualizar uma instalação em uso

Faça uma cópia de segurança e substitua apenas as pastas `public` e `admin` pelos arquivos desta entrega. Preserve o `.env` e a pasta de dados da instalação em uso; os dados do ZIP representam a versão recebida, não eventuais pedidos posteriores. Recarregue o navegador após a atualização.

## O que mudou

- Cabeçalho responsivo com navegação para produtos, personalização e contato.
- Apresentação principal com foto do catálogo e identidade da marca.
- Cards com fotos ampliadas preenchendo a área de imagem, como na versão original, carrossel preservado, preços e ações mais claros.
- Seção explicativa de personalização e rodapé reorganizado.
- Carrinho com campos Bootstrap, resumo visual, estados de frete e retorno de pedido.
- Navegação por teclado no carrinho: Escape, foco contido e retorno ao botão anterior. Opções de frete selecionáveis por teclado.
- Login, pedidos, tabelas, abas, conta e editores administrativos com o mesmo padrão visual.
- Ajustes para telas pequenas, foco visível, movimento reduzido e catálogo vazio.

Os scripts existentes continuam controlando os modais, as abas e a galeria. O CSS do Bootstrap está em `public/vendor/bootstrap/`; o tema da loja está em `public/theme.css`, e o tema administrativo foi acrescentado a `admin/style.css`. Assim, nenhuma rota nova precisou ser criada.

## Verificação

- `npm test`: 10 testes aprovados antes e depois das alterações, cobrindo contas, pedidos, checkout, CPF e catálogo.
- Navegador Microsoft Edge: larguras de 320, 390, 768, 1024 e 1440 pixels na loja; 320, 390, 768 e 1440 no painel.
- Verificados: troca de fotos, adição e quantidade de itens, persistência após recarga, foco e Escape, frete demonstrativo, seleção de frete por teclado e registro de pedido em uma pasta isolada de teste.
- Verificados login/logout, abas, tabelas, abertura dos editores de pedido e produto e diálogo de conta. Sem erros JavaScript ou recursos ausentes no percurso verificado.
- Revisão visual de capturas desktop e mobile. As tabelas largas do painel mantêm rolagem interna, sem alargar a página.

Limitações: frete real da SuperFrete, envio de mensagem pelo WhatsApp e implantação na VPS não foram executados. O checkout foi exercitado com frete demonstrativo e a abertura do WhatsApp foi bloqueada no teste. Safari, Firefox e dispositivos físicos não foram testados. Alterações administrativas reais e upload não foram exercitados pelo navegador; os testes automatizados originais cobrem persistência, edição e upload.

Referência da biblioteca: [documentação oficial do Bootstrap](https://getbootstrap.com/docs/5.3/getting-started/introduction/). A licença MIT acompanha os arquivos locais.
