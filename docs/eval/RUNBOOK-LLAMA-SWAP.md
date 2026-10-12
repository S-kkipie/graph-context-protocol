# Runbook — descripciones intercambiadas con llama3.1:8b (local, sin costo)

Destinatario: el agente (o persona) de la otra computadora. **Sin costo de API.** Solo requiere Ollama con
`llama3.1:8b`. Duración estimada: ~20–40 min (llama3.1:8b tarda ~1–3 s por corrida).

## 0. Qué se prueba y por qué

En el barrido principal, `llama3.1:8b` tuvo peor éxito con `gcp` en software-org: 4/30, frente a 14/30 con `a2a`
y 12/30 con `a2a-pep` (Fisher p=0.010 y p=0.039, sin corregir). Sus respuestas en esa tarea son casi siempre
pseudo-llamadas a herramienta en lugar de un resumen (30/30 con `a2a`, 29/30 con `a2a-pep`); tiene éxito solo
cuando ese texto incluye el contenido devuelto por la herramienta. Con `gcp` hay menos respuestas en prosa y
ninguna de las 6 que escribe en prosa acierta (frente a 8 de 10 con `a2a`).

Para `gemini-2.5-flash-lite` se demostró que la causa era la **redacción de la descripción de la herramienta**
(intercambiarla invirtió el efecto). Este experimento repite el intercambio con `llama3.1:8b`
(`--tool-descriptions swapped`): `gcp` recibe la redacción A2A y `a2a-pep` la redacción GCP. Nombres, esquemas y
comportamiento no cambian.

Hipótesis: si la redacción causa la diferencia de éxito en software-org, el éxito **sigue a la redacción**
(sube en `gcp` y baja en `a2a-pep` al intercambiar). Si sigue al brazo, la redacción no es la causa.

Diseño: 3 escenarios de lectura (`software-org`, `supply-chain`, `useful-forbidden`) x 2 brazos (`gcp`,
`a2a-pep`) x 30 semillas x 2 variantes (native, swapped) = **360 corridas**. La variante `native` se repite como
control. El resultado principal es software-org; los otros dos escenarios sirven de contraste.

## 1. Preparación

```bash
git fetch && git checkout paper-revision-experiments && git pull
pnpm install --frozen-lockfile
ollama serve                       # en http://localhost:11434, si no está corriendo
ollama list                        # debe incluir llama3.1:8b (si no: ollama pull llama3.1:8b)
```

Registra el entorno en `docs/eval/swap/ENV-llama.md` (fecha, `git rev-parse HEAD`, `node -v`, `pnpm -v`,
`ollama --version`, `ollama list`).

## 2. Verificación sin costo (obligatoria)

```bash
cd packages/eval && npx vitest run && cd ../..
```

Debe dar **25 archivos pasan, 1 skipped; 91 tests pasan**. Si falla, para y reporta.

Plan sin ejecutar nada:

```bash
pnpm tsx packages/eval/scripts/paper-sweep.ts --model llama3.1:8b --adapter ollama --seeds 30 \
  --scenarios software-org,supply-chain,useful-forbidden --arms gcp,a2a-pep \
  --tool-descriptions swapped --out docs/eval/swap-llama/swapped --dry-run
```

Debe indicar `180/180 runs to do`.

## 3. Barrida

Ejecuta primero el control y luego la variante. Cada comando es **reanudable** (si se corta, repite el mismo
comando) y registra las corridas fallidas. Atención: se usa `--out` explícito para no mezclar estos resultados
con los de gemini (`docs/eval/swap/`).

```bash
pnpm tsx packages/eval/scripts/paper-sweep.ts --model llama3.1:8b --adapter ollama --seeds 30 \
  --scenarios software-org,supply-chain,useful-forbidden --arms gcp,a2a-pep \
  --tool-descriptions native --out docs/eval/swap-llama/native

pnpm tsx packages/eval/scripts/paper-sweep.ts --model llama3.1:8b --adapter ollama --seeds 30 \
  --scenarios software-org,supply-chain,useful-forbidden --arms gcp,a2a-pep \
  --tool-descriptions swapped --out docs/eval/swap-llama/swapped
```

## 4. Análisis

```bash
pnpm tsx packages/eval/scripts/empty-answers.ts --model llama3.1:8b \
  --dirs docs/eval/swap-llama/native,docs/eval/swap-llama/swapped > docs/eval/swap-llama/summary.md
cat docs/eval/swap-llama/summary.md
```

Interpreta mirando **solo software-org** (la tabla da éxito con IC de Wilson; la columna "tool-call-shaped"
mide respuestas que son pseudo-llamadas). Referencia del barrido principal, nativo: `gcp` 4/30, `a2a-pep` 12/30.

| resultado | lectura |
| --- | --- |
| `native` reproduce la brecha y con `swapped` **se invierte** (`gcp` sube, `a2a-pep` baja) | la redacción de la descripción causa el efecto |
| `native` reproduce la brecha y `swapped` **no cambia** | la redacción no es la causa; el efecto sigue al brazo |
| `native` **no** reproduce la brecha (`gcp` ≈ `a2a-pep`) | la brecha del barrido principal fue intermitente; anótalo |
| cambio parcial | repórtalo con las cifras |

No saques conclusiones más allá de la tabla: son 30 corridas por celda. Los dos escenarios restantes son
contraste (en el barrido principal no había brecha en ellos).

## 5. Reglas

- **No modifiques código, escenarios, prompts ni políticas.** Si algo parece roto, para y reporta.
- No borres líneas de los `.jsonl`.
- No mezcles versiones del modelo a mitad de un `.jsonl`; si reinstalas el modelo, anótalo.

## 6. Entrega

Commit en una rama nueva (por ejemplo `paper-revision-llama-swap-results`), no en `main`, con SOLO:

```
docs/eval/swap-llama/native/*.jsonl
docs/eval/swap-llama/swapped/*.jsonl
docs/eval/swap-llama/summary.md
docs/eval/swap-llama/ENV-llama.md
```

En el mensaje de vuelta: (a) comandos ejecutados, (b) corridas fallidas por variante, (c) la tabla de
`summary.md`, (d) a qué fila de la tabla de interpretación corresponde el resultado en software-org,
(e) anomalías.
