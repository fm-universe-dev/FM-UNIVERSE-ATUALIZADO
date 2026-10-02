import { sistemaFinanceiroService } from './sistemaFinanceiroService';

export function runSistemaFinanceiroTests(): { passed: boolean; results: any[] } {
  console.log('\n====================================================');
  console.log('  TESTES OBRIGATÓRIOS DO SISTEMA FINANCEIRO FM UNIVERSE  ');
  console.log('====================================================');

  const results = sistemaFinanceiroService.runSimulationTests();
  let allPassed = true;

  results.forEach((r, idx) => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`\n${icon} [${r.testId}] ${r.name}`);
    console.log(`   Esperado: ${r.expected}`);
    console.log(`   Obtido:   ${r.actual}`);
    console.log(`   Detalhes: ${r.details}`);
    if (!r.passed) allPassed = false;
  });

  console.log('\n----------------------------------------------------');
  if (allPassed) {
    console.log(`✅ SUCESSO: Todos os ${results.length} testes de simulação financeira passaram!`);
  } else {
    console.error(`❌ FALHA: Um ou mais testes financeiros falharam.`);
  }
  console.log('====================================================\n');

  return { passed: allPassed, results };
}

runSistemaFinanceiroTests();

