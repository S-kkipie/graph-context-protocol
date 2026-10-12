# Runbook — experimento de descripciones de herramienta (flash-lite)

Destinatario: el agente (o persona) de la otra computadora. Coste esperado: **menos de 0,10 USD**; ~35–60 min.

## 0. Qué se prueba y por qué

En el barrido principal, `gemini-2.5-flash-lite` falló más con el brazo `gcp` que con `a2a-pep` (misma barrera
y mismo log). Las trazas muestran que los 40 fallos de lectura de `gcp` tienen la misma secuencia de llamadas
que los éxitos y terminan con una **respuesta final vacía** (60/150 corridas `gcp` vs 3/150 en cada brazo A2A).
Los tres brazos enlazan una herramienta por par; la única diferencia entre las herramientas `gcp` y A2A es el
**texto de la descripción** ("Read the shared context ... over the Graph Context Protocol" vs "Ask the peer
node ... via an A2A message"). Este experimento **intercambia las descripciones** entre brazos
(`--tool-descriptions swapped`): `gcp` recibe la redacción A2A y `a2a-pep` la redacción GCP. Nombres, esquemas
y comportamiento no cambian.

Hipótesis: si la redacción causa el fallo, la tasa de respuestas vacías **sigue a la redacción** (baja en `gcp`,
sube en `a2a-pep`). Si sigue al brazo, la redacción no es la causa.

Diseño: 3 escenarios de lectura (`software-org`, `supply-chain`, `useful-forbidden`) x 2 brazos (`gcp`,
`a2a-pep`) x 30 semillas x 2 variantes (native, swapped) = **360 corridas**. Se repite también `native` como
control, porque el proveedor puede derivar entre días.

## 1. Preparación

```bash
git fetch && git checkout paper-revision-experiments && git pull
pnpm install --frozen-lockfile
export GEMINI_API_KEY=...        # solo en la sesión; no la escribas en ningún archivo ni la commitees
```

## 2. Verificación sin costo (obligatoria)

```bash
cd packages/eval && npx vitest run && cd ../..
```

Debe dar **24 archivos pasan, 1 skipped; 88 tests pasan**. Si falla, para y reporta.

```bash
pnpm tsx packages/eval/scripts/paper-sweep.ts --model mock-model --adapter mock --seeds 2 \
  --scenarios software-org,supply-chain,useful-forbidden --arms gcp,a2a-pep \
  --tool-descriptions swapped --out tmp/swap-check
```

Debe terminar con `12 ok, 0 failed`. Luego borra `tmp/swap-check`.

Plan sin ejecutar nada:

```bash
pnpm tsx packages/eval/scripts/paper-sweep.ts --model gemini-2.5-flash-lite --adapter google --seeds 30 \
  --scenarios software-org,supply-chain,useful-forbidden --arms gcp,a2a-pep \
  --tool-descriptions swapped --dry-run
```

Debe indicar `180/180 runs to do` y `log=.../docs/eval/swap/swapped/gemini-2.5-flash-lite.jsonl`.

## 3. Barrida

Ejecuta primero el control y después la variante. Cada comando es **reanudable** (si se corta, repite el mismo
comando) y registra las corridas fallidas.

```bash
pnpm tsx packages/eval/scripts/paper-sweep.ts --model gemini-2.5-flash-lite --adapter google --seeds 30 \
  --scenarios software-org,supply-chain,useful-forbidden --arms gcp,a2a-pep --tool-descriptions native

pnpm tsx packages/eval/scripts/paper-sweep.ts --model gemini-2.5-flash-lite --adapter google --seeds 30 \
  --scenarios software-org,supply-chain,useful-forbidden --arms gcp,a2a-pep --tool-descriptions swapped
```

Salidas: `docs/eval/swap/native/` y `docs/eval/swap/swapped/`. Si ves errores 429, sube `--throttle-ms`
(por defecto 2000). Si el gasto parece desviarse mucho de unos pocos centavos tras las primeras ~30 corridas,
para y avisa.

## 4. Análisis

```bash
pnpm tsx packages/eval/scripts/empty-answers.ts --model gemini-2.5-flash-lite \
  --dirs docs/eval/swap/native,docs/eval/swap/swapped > docs/eval/swap/empty-answers.md
cat docs/eval/swap/empty-answers.md
```

La tabla da, por variante, escenario y brazo: corridas, éxito con IC de Wilson, respuestas vacías y vacías
entre fallos. Interpreta así (referencia del barrido principal, `gcp` nativo: éxito 21/30, 20/30 y 9/30 y
respuestas vacías 9, 10 y 21 de 30 en software-org, supply-chain y useful-forbidden; `a2a-pep`: 0 a 2 vacías):

| resultado | lectura |
| --- | --- |
| `native` reproduce el patrón y en `swapped` las vacías **se invierten** (bajan en `gcp`, suben en `a2a-pep`) | la redacción de la descripción causa el efecto |
| `native` reproduce el patrón y `swapped` **no cambia** nada | la redacción no es la causa; el efecto sigue al brazo (servidor, formato de salida) |
| `native` **no** reproduce el patrón (`gcp` ya casi sin vacías) | el fallo del barrido principal fue intermitente (deriva del proveedor); anótalo |
| cambio parcial | repórtalo tal cual, con las cifras |

No saques conclusiones más allá de la tabla: son 30 corridas por celda.

## 5. Reglas

- **No modifiques código, escenarios, prompts ni políticas.** Si algo parece roto, para y reporta.
- No incluyas claves API en ningún archivo, log o mensaje.
- No borres líneas de los `.jsonl`.

## 6. Entrega

Commit en una rama nueva (por ejemplo `paper-revision-swap-results`), no en `main`, con SOLO:

```
docs/eval/swap/native/*.jsonl
docs/eval/swap/swapped/*.jsonl
docs/eval/swap/empty-answers.md
```

En el mensaje de vuelta: (a) comandos ejecutados, (b) corridas fallidas por variante, (c) la tabla de
`empty-answers.md`, (d) a qué fila de la tabla de interpretación corresponde el resultado, (e) anomalías.
