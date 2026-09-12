# Modelos e medidas individuais

## Cliente

Na página inicial, escolha o modelo e informe a quantidade antes de adicionar ao carrinho. Para comprar outro modelo do mesmo produto, adicione-o novamente com a nova seleção. Cada modelo aparece em uma linha própria, com controles independentes de quantidade e remoção. A escolha permanece ao atualizar a página e aparece no pedido.

Nas observações, informe a qual modelo e unidade cada cor corresponde, inclusive quando forem várias unidades do mesmo modelo.

## Administrador

1. Abra Admin → Produtos → Novo produto ou Editar.
2. Preencha os dados gerais do produto.
3. Na seção Modelos / opções do produto, clique em Adicionar modelo.
4. Informe o nome e, se necessário, largura, comprimento, altura (cm) e peso (kg) individuais. Campos de medidas vazios usam os dados gerais do produto ao salvar.
5. Adicione as fotos e clique em Salvar produto.

Até 50 modelos por produto. Os modelos compartilham o preço e a galeria do produto. Remova todas as opções para vender um produto sem seleção de modelo.

As caixas já existentes têm as opções cadastradas no catálogo deste ZIP. As medidas originais do produto foram copiadas como valores iniciais de cada modelo: ajuste os valores reais em Admin → Produtos → Editar antes de usá-los em cotações. Não foram estimados novos pesos ou tamanhos.

O frete usa as medidas do modelo selecionado e a quantidade. Mantém a regra de embalagem do projeto: soma pesos e alturas, e usa a maior largura e o maior comprimento. O pedido registra o modelo junto ao nome do item.

## Atualizar uma instalação existente

Extraia o ZIP e reinicie o servidor pelo inicializador usado normalmente. Ao atualizar uma loja que já recebe pedidos, preserve o arquivo .env e os dados atuais da pasta data (ou do DATA_DIR configurado), incluindo pedidos, conta e imagens. Não substitua dados mais recentes pelos dados desta cópia. Nesse caso, adicione os modelos dos produtos existentes pelo admin após atualizar o código. Isso é especialmente importante se o servidor usa um volume de dados separado.

Itens antigos do carrinho sem uma seleção válida são removidos com um aviso para escolher novamente o modelo. Pedidos já gravados continuam preservados.

## Verificação

13 testes automatizados aprovados com `npm test`, incluindo cadastro e persistência dos modelos, validação, quantidades separadas, pedido e dimensões enviadas à integração de frete. A integração foi verificada com transportadora simulada, sem cotações reais. A inspeção visual em navegador não foi executada por indisponibilidade do navegador neste ambiente.
