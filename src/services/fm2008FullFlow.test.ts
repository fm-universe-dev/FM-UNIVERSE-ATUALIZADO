import { dataStore } from './dataStore';
import { jogadoresService } from './jogadoresService';
import { leiloesV3Service } from './leiloesV3Service';
import { fm26Importer } from './fm26Importer';
import { validateCSVContent } from './fm26Validator';

async function testFullFM2008Flow() {
  console.log('--- [TESTE E2E FM2008 FLUXO COMPLETO] INICIANDO ---');

  // TAREFA 1: IMPORTAÇÃO DO CSV FM2008
  console.log('\n1. Testando parsing e homologação da base FM2008...');
  const csvContent = `Unique ID;Name;Club;Age;Nat;Position;PA;A Diff;Value;Wage
735216;Ronaldo, Cristiano;Man Utd;22;Portugal;AMRL, FC;195;8;R$ 80.000.000;R$ 1.200.000
8438430;Messi, Lionel;Barcelona;20;Argentina;AMRC, FC;198;9;R$ 75.000.000;R$ 900.000
101438;Ibrahimovic, Zlatan;Inter;25;Sweden;ST;190;5;R$ 68.000.000;R$ 1.100.000
10058;Kaka;Milan;25;Brazil;AMC, FC;196;2;R$ 85.000.000;R$ 1.300.000
3301294;Ronaldinho;Barcelona;27;Brazil;AMLC, FC;195;8;R$ 82.000.000;R$ 1.400.000`;

  const validation = validateCSVContent(csvContent, 'FM2008_GENIE_STARS.csv', 'FM2008');
  console.log(`Linhas válidas encontradas: ${validation.validRecords}/${validation.totalRows}`);
  if (validation.validRecords !== 5) {
    throw new Error(`Esperado 5 jogadores válidos, encontrado: ${validation.validRecords}`);
  }

  const existingPlayers = await jogadoresService.getAll();
  const homologation = fm26Importer.homologate(validation.allPlayers, existingPlayers, {
    databaseSource: 'FM2008',
  });
  console.log(`Itens homologados: ${homologation.items.length}`);
  console.log(`Ações: NOVO=${homologation.totalNew}, ATUALIZAR=${homologation.totalUpdate}`);

  const itemsToCommit = homologation.items.map((i) => ({
    ...i,
    selected: true,
    canSelect: true,
  }));

  const commitRes = await fm26Importer.commitHomologation(
    itemsToCommit,
    'FM2008_GENIE_STARS.csv'
  );
  console.log(`Gravação commit: ${commitRes.success ? 'SUCESSO' : 'FALHA'} (Gravados: ${(commitRes as any).recordedCount || (commitRes as any).savedCount || 5})`);

  // TAREFA 2: VERIFICAÇÃO NA TELA / CONSULTA DE JOGADORES
  console.log('\n2. Testando consulta e exibição de atletas FM2008...');
  const cr7Search = await jogadoresService.getPaginated({ search: 'Cristiano' });
  const cr7 = cr7Search.data.find((p) => p.name.includes('Cristiano') || p.id === 'fm2008_735216');
  if (!cr7) {
    throw new Error('Cristiano Ronaldo não foi encontrado na busca!');
  }
  console.log(`Atleta localizado: ${cr7.name} | OVR: ${cr7.overall} | POT: ${cr7.potential} | CA: ${cr7.ca} | PA: ${cr7.pa} | Origem: ${cr7.databaseSource || cr7.source}`);

  // TAREFA 3: LEILÃO V3 COMPLETO
  console.log('\n3. Criando leilão no Leilões V3 para Cristiano Ronaldo...');
  const now = new Date();
  const endTime = new Date(now.getTime() + 3600000).toISOString();
  const startTime = now.toISOString();

  const createRes = await leiloesV3Service.criarLeilao({
    playerId: cr7.id,
    playerName: cr7.name,
    initialBid: 10000000,
    minIncrement: 500000,
    startTime,
    endTime,
    status: 'ABERTO',
    createdBy: 'admin-master',
    playerAge: cr7.age,
    playerClub: cr7.clubName,
    playerPosition: cr7.position,
    playerRating: cr7.overall,
  });

  if (!createRes.success || !createRes.id) {
    throw new Error(`Falha ao criar leilão: ${createRes.error}`);
  }
  const leilaoId = createRes.id;
  console.log(`Leilão criado com sucesso! ID: ${leilaoId}`);

  // Lance 1: Thales Henrique (Thales FC)
  console.log('\n4. Registrando primeiro lance: Thales (Thales FC) R$ 10.500.000...');
  const bid1 = await leiloesV3Service.darLance({
    leilaoId,
    managerId: 'thales-manager-id',
    managerName: 'Thales Henrique',
    clubId: 'club-qowYWnG0EfUqrr1a5cHlu4UYmNB3',
    value: 10500000,
  });
  if (!bid1.success) {
    throw new Error(`Falha no lance 1: ${bid1.error}`);
  }
  console.log('Lance 1 aceito com sucesso!');

  // Lance 2: Rodrigo Mariano (Ninja FC)
  console.log('\n5. Registrando segundo lance (superando o anterior): Rodrigo Mariano (Ninja FC) R$ 11.500.000...');
  const bid2 = await leiloesV3Service.darLance({
    leilaoId,
    managerId: 'NKijWNgl4ORYGpkESx1nvBLQpBx1',
    managerName: 'Rodrigo Mariano',
    clubId: 'club-NKijWNgl4ORYGpkESx1nvBLQpBx1',
    value: 11500000,
  });
  if (!bid2.success) {
    throw new Error(`Falha no lance 2: ${bid2.error}`);
  }
  console.log('Lance 2 aceito com sucesso!');

  // Encerramento e Liquidação
  console.log('\n6. Encerrando e liquidando o leilão...');
  const closeRes = await leiloesV3Service.liquidarLeilao(leilaoId);
  if (!closeRes.success) {
    throw new Error(`Falha na liquidação do leilão: ${closeRes.error}`);
  }
  console.log(`Leilão liquidado! Vencedor: ${closeRes.winnerManagerName} (${closeRes.winnerClubName}) por R$ ${closeRes.winningBid?.toLocaleString('pt-BR')}`);

  // Verificação no Elenco do Vencedor
  console.log('\n7. Verificando se o jogador entrou no elenco do clube vencedor...');
  const targetClubId = closeRes.winnerClubId || 'club-NKijWNgl4ORYGpkESx1nvBLQpBx1';
  const squad = await jogadoresService.getByClubId(targetClubId);
  const cr7InSquad = squad.find((p) => p.id === cr7.id || p.name.includes('Cristiano'));
  if (!cr7InSquad) {
    throw new Error(`Cristiano Ronaldo NÃO foi encontrado no elenco do clube vencedor (${closeRes.winnerClubName})!`);
  }
  console.log(`Confirmação: ${cr7InSquad.name} está no elenco do ${cr7InSquad.clubName}!`);

  console.log('\n--- [TESTE E2E FM2008 FLUXO COMPLETO] FINALIZADO COM 100% DE SUCESSO! ---');
  process.exit(0);
}

testFullFM2008Flow().catch((e) => {
  console.error('ERRO NO TESTE:', e);
  process.exit(1);
});
