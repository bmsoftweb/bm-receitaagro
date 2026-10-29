/** Conferência das regras de cálculo: npx tsx scripts/teste-receita.ts */
import assert from 'node:assert/strict';
import { arredonda, calcularQuantidade, calcularArea, doseValida, numeroReceitaFull, chavePdf, tiposAplicacaoLiberados, acertaUnidade } from '../shared/receita.ts';
import { documentoValido } from '../server/util.ts';

// 1,5 L/HA × 10 ha × 2 aplicações, adquirir L → 30 L
assert.equal(calcularQuantidade({ dose: 1.5, unDose: 'L/HA', unAdquirir: 'L', calda: 0, nrAplic: 2, area: 10 }), 30);
// 200 ML/100L, calda 300, 5 ha, adquirir L → 3 L
assert.equal(calcularQuantidade({ dose: 200, unDose: 'ML/100L', unAdquirir: 'L', calda: 300, nrAplic: 1, area: 5 }), 3);
// inverso: 3 L → 5 ha
assert.equal(calcularArea({ dose: 200, unDose: 'ML/100L', unTratamento: 'ml/100l', unAdquirir: 'L', calda: 300, nrAplic: 1, qtd: 3 }), 5);
assert.equal(calcularArea({ dose: 1.5, unDose: 'L/HA', unTratamento: 'l/ha', unAdquirir: 'L', calda: 0, nrAplic: 2, qtd: 30 }), 10);
assert.equal(calcularQuantidade({ dose: 0, unDose: 'L/HA', unAdquirir: 'L', calda: 0, nrAplic: 1, area: 1 }), null);
assert.equal(arredonda(1.005 * 1), 1); // bancário (1,005 em float é 1,00499…)
assert.equal(arredonda(0.125), 0.12);
assert.equal(arredonda(0.135), 0.14);
assert.ok(doseValida(1.5, 'L/HA', 1000, 2000, 'ML/HA'));
assert.ok(!doseValida(3, 'L/HA', 1000, 2000, 'ML/HA'));
assert.ok(doseValida(2, 'L/HA', 1, 3, 'l/ha'));
assert.equal(numeroReceitaFull(2026, '123', 7), '42260012300007');
assert.equal(chavePdf('123/45', 7), 'receita_00012345_000007');
assert.equal(acertaUnidade('L / HA'), 'l/ha');
const tipos = [{ id: 1, descricao: 'Terrestre' }, { id: 3, descricao: 'Aérea' }, { id: 10, descricao: 'Outra' }];
assert.deepEqual(tiposAplicacaoLiberados(tipos, '[10]', 0).map((t) => t.id), [1]);
assert.deepEqual(tiposAplicacaoLiberados(tipos, '[]', 50).map((t) => t.id), [1, 3, 10]);
assert.ok(documentoValido('52998224725'));
assert.ok(!documentoValido('52998224724'));
assert.ok(documentoValido('11222333000181'));
assert.ok(!documentoValido('11111111111'));
console.log('ok');
