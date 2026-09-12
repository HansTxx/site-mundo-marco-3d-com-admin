# Atualização da VPS preservando dados locais

Esta alteração remove data/ e .env do rastreamento. O código continua usando ./data:/app/data e .env.
A primeira atualização pode remover os arquivos antes rastreados do diretório da VPS. Faça backup e restaure antes de iniciar o aplicativo.

## Primeira atualização
Execute na raiz do projeto, na mesma sessão Bash. Se você já moveu arquivos para fora de data/, recupere primeiro a cópia correta. Não substitua dados de produção pelos arquivos do repositório.

1. Pare o aplicativo:
```bash
docker compose stop mundo3d-app
```

2. Faça backup fora do repositório. Só prossiga quando as duas cópias terminarem sem erro:
```bash
backup_loja=$(mktemp -d "$HOME/mundo3d-backup.XXXXXX")
cp -a data "$backup_loja/" &&
cp -a .env "$backup_loja/" &&
echo "Backup salvo em: $backup_loja"
```

3. Guarde as alterações locais e atualize main somente após a integração desta proposta:
```bash
git stash push -u -m "Dados antes da migracao" -- data .env &&
git pull --ff-only
```
Se houver outro conflito ou histórico divergente, não force a atualização. Restaure os dados no passo seguinte mesmo se o pull falhar.

4. Restaure as cópias, preservando permissões e propriedade. Não inicie o aplicativo se alguma cópia falhar:
```bash
mkdir -p data &&
cp -a "$backup_loja/data/." data/ &&
cp -a "$backup_loja/.env" .env
```

5. Se o pull e a restauração funcionaram:
```bash
docker compose up -d --build mundo3d-app
git ls-files -- data .env
git check-ignore data/pedidos.json .env
docker compose ps
```
O comando git ls-files acima deve ficar sem saída. git check-ignore deve mostrar os caminhos ignorados.
Se apenas o pull falhou e os dados foram restaurados, use docker compose start mundo3d-app para iniciar o contêiner anterior e investigue o erro antes de tentar novamente.
Não execute git stash pop: os dados já foram restaurados pelo backup.
Guarde o backup fora do repositório até conferir conta, pedidos, catálogo e imagens.

## Próximas atualizações
Depois de concluir a migração, as gravações em data/ e .env não bloquearão novos pulls. Conflitos em código ou históricos divergentes ainda precisam ser tratados.
```bash
git pull --ff-only &&
docker compose up -d --build mundo3d-app
```
Continue mantendo backups periódicos dos dados.

## Instalação nova
Crie .env a partir de .env.example, configure os valores reais e prepare a pasta data com permissão de escrita para o usuário node do contêiner (UID/GID 1000 na imagem atual). O catálogo inicial vem de public/produtos.json; pedidos e conta são criados pelo aplicativo conforme necessário. Não copie dados de outra instalação.

## Credenciais e histórico
Remover arquivos do rastreamento não apaga versões anteriores do Git. Como o repositório é público e .env foi versionado, trate credenciais reais presentes nele como expostas e substitua-as nos respectivos serviços. Altere também a senha administrativa se a conta real esteve versionada. Não publique backups nem cole credenciais em issues ou mensagens.
A remoção de dados do histórico exige um trabalho separado e coordenado; esta proposta não reescreve o histórico.
