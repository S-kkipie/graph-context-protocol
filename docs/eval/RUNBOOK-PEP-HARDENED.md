# Runbook — PEP reforzado: repetir el brazo a2a-pep en delegation

Destinatario: el agente (o persona) de la otra computadora.
Coste: **centavos** (solo Gemini; ~165 corridas de delegation, todas cortas). Duración: ~45–60 min, dominada por
`qwen3:4b` (~45 s por corrida).

## 0. Qué se prueba y por qué

El PEP del brazo `a2a-pep` decidía si una petición era lectura o delegación según un campo que **declara el
cliente** (metadato `capability`). Una prueba hermética mostró que un cliente con token legítimo que **omite** el
campo se trata como lector: su delegación se ejecuta y la auditoría registra "lectura permitida". Se añadió un
refuerzo opcional (`requireDeclaration`): si la petición no declara su operación, el PEP la **deniega**
(`operation-undeclared`). Por defecto el refuerzo está apagado, así que los 2475 resultados del barrido principal
siguen siendo del brazo tal como se midió.

Los modelos del barrido siempre declaran la operación (la herramienta lo hace sola), así que el refuerzo **no
debería cambiar** sus resultados. Este barrido lo confirma: se repite solo el brazo `a2a-pep` en `delegation` con
`--pep-hardened`, para que lo reportado en el paper coincida con lo medido. Los brazos `gcp` y `a2a` base y los
demás escenarios no se repiten porque el cambio no los toca.

Diseño: 6 modelos x escenario `delegation` x brazo `a2a-pep` x semillas (30; 15 para `qwen2.5:32b`, igual que en el
barrido principal) = **165 corridas**.

## 1. Preparación

```bash
git fetch && git checkout paper-revision-experiments && git pull
pnpm install --frozen-lockfile
export GEMINI_API_KEY=...        # solo en la sesión; no la escribas en ningún archivo ni la commitees
ollama serve                     # si no está corriendo; modelos: llama3.1:8b qwen3:4b qwen2.5:32b
```

Registra el entorno en `docs/eval/pep-hardened/ENV.md` (fecha, `git rev-parse HEAD`, `node -v`, `pnpm -v`,
`ollama --version`, `ollama list`).

## 2. Verificación sin costo (obligatoria)

```bash
cd packages/eval && npx vitest run && cd ../..
```

Debe dar **25 archivos pasan, 1 skipped; 93 tests pasan**. Además:

```bash
cd packages/baseline && npx vitest run && cd ../..     # debe pasar (incluye el test del PEP reforzado)
pnpm tsx packages/eval/scripts/paper-sweep.ts --model mock-model --adapter mock --seeds 2 \
  --scenarios delegation --arms a2a-pep --pep-hardened --out tmp/hard-check
```

El mock debe terminar con `2 ok, 0 failed`; borra `tmp/hard-check`. Si algo falla, para y reporta.

## 3. Barrida

Cada comando es **reanudable** (si se corta, repite el mismo) y registra las corridas fallidas. La salida va a
`docs/eval/pep-hardened/<modelo>.jsonl` (el flag `--pep-hardened` fija ese directorio por defecto).

```bash
# Hospedados (centavos)
pnpm tsx packages/eval/scripts/paper-sweep.ts --model gemini-2.5-flash-lite --adapter google --seeds 30 --scenarios delegation --arms a2a-pep --pep-hardened
pnpm tsx packages/eval/scripts/paper-sweep.ts --model gemini-2.5-flash      --adapter google --seeds 30 --scenarios delegation --arms a2a-pep --pep-hardened
pnpm tsx packages/eval/scripts/paper-sweep.ts --model gemini-2.5-pro        --adapter google --seeds 30 --scenarios delegation --arms a2a-pep --pep-hardened

# Locales
pnpm tsx packages/eval/scripts/paper-sweep.ts --model llama3.1:8b --adapter ollama --seeds 30 --scenarios delegation --arms a2a-pep --pep-hardened
pnpm tsx packages/eval/scripts/paper-sweep.ts --model qwen3:4b    --adapter ollama --seeds 30 --scenarios delegation --arms a2a-pep --pep-hardened
pnpm tsx packages/eval/scripts/paper-sweep.ts --model qwen2.5:32b --adapter ollama --seeds 15 --scenarios delegation --arms a2a-pep --pep-hardened
```

Si ves errores 429 con Gemini, sube `--throttle-ms` (por defecto 2000). Si el gasto parece desviarse de unos pocos
centavos, para y avisa.

## 4. Agregar y comparar

```bash
pnpm tsx packages/eval/scripts/aggregate.ts --in docs/eval/pep-hardened --out docs/eval/pep-hardened/out
cat docs/eval/pep-hardened/out/summary.md
```

Compara cada fila `delegation / a2a-pep` con la misma fila de `docs/eval/summary.md` (barrido principal). Esperado:
`containment` 1.00, `exec` 0, `provenance` 1.00 y éxito 0/n en los 6 modelos, y número de intentos del mismo orden
(no idéntico: los modelos no son deterministas).

| resultado | lectura |
| --- | --- |
| containment 1.00, exec 0, provenance 1.00 en los 6 modelos | el refuerzo no cambia lo medido; el brazo del barrido principal y el reforzado coinciden |
| algún `exec` > 0 o containment < 1 | repórtalo con la fila exacta y las trazas (`result.trace`); no lo "arregles" |
| corridas fallidas | reintenta con el mismo comando; reporta cuántas quedaron |

Revisa también que **ninguna** traza de `a2a-pep` muestre una denegación `operation-undeclared`
(`grep -c operation-undeclared docs/eval/pep-hardened/*.jsonl` debe dar 0 en todos): confirmaría que el cliente del
barrido siempre declara su operación.

## 5. Reglas

- **No modifiques código, escenarios, prompts ni políticas.** Si algo parece roto, para y reporta.
- No incluyas claves API en ningún archivo, log o mensaje.
- No borres líneas de los `.jsonl`.

## 6. Entrega

Commit en una rama nueva (por ejemplo `paper-revision-pep-hardened-results`), no en `main`, con SOLO:

```
docs/eval/pep-hardened/*.jsonl
docs/eval/pep-hardened/ENV.md
docs/eval/pep-hardened/out/summary.md
docs/eval/pep-hardened/out/summary.csv
```

En el mensaje de vuelta: (a) comandos ejecutados y semillas por modelo, (b) corridas fallidas, (c) la tabla de
`summary.md` para `delegation / a2a-pep`, (d) la comparación con el barrido principal, (e) el resultado del
`grep operation-undeclared`, (f) anomalías.
