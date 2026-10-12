# Runbook — experimentos para la revisión del paper (GCP vs A2A)

Destinatario: el agente (o persona) que corre los experimentos en la otra computadora.
Origen: dos reportes de revisores sobre `docs/paper/article-gcp-vs-a2a.tex`. Este runbook ejecuta solo lo
que requiere corridas con modelos; la edición del paper la hace la sesión de la laptop con los resultados.

## 0. Qué se está midiendo y por qué

Los revisores objetaron que "containment 1.00 vs 0.00" y "provenance 1.0 vs 0.0" son verdad por construcción,
porque A2A base no tiene autorización ni log. Se agregó un **tercer brazo**:

| brazo | qué es |
| --- | --- |
| `gcp` | Graph Context Protocol: gate de lectura + gate de delegación + audit sink |
| `a2a` | A2A base tal como se distribuye: sin autorización, sin log |
| `a2a-pep` | **A2A instrumentado**: mismo servidor A2A, más un PEP que autentica un bearer token, aplica la **misma política de roles** y la misma regla `cap:delegate-task`, y escribe un audit log por decisión |

También hay un **escenario nuevo**, `useful-forbidden`: el nodo confidencial es útil para la tarea pero el rol no
puede leerlo, y la fuga se puntúa con patrones semánticos (parafraseo) además del canary exacto.

Resultado esperado y honesto: `a2a-pep` probablemente **empata con gcp en containment y provenance**. Eso es un
resultado válido; no hay que "arreglarlo". Lo que importa es medirlo.

Las trazas (respuesta final, transcript de tools, decisiones de auditoría) se guardan en cada línea del log para
poder re-puntuar fuga y diagnosticar fallos sin repetir corridas.

## 1. Preparación (una vez)

```bash
git fetch && git checkout <RAMA-ACORDADA>      # la rama con los cambios de la laptop
pnpm install --frozen-lockfile
```

Requisitos por tipo de modelo:

- **Locales (Ollama):** `ollama serve` corriendo en `http://localhost:11434`; modelos descargados:
  `ollama pull llama3.1:8b qwen3:4b qwen2.5:32b`.
- **Gemini:** variable `GEMINI_API_KEY` (no la escribas en ningún archivo ni la commitees).

Registra el entorno (reproducibilidad), desde la raíz del repo:

```bash
mkdir -p docs/eval/raw
{
  echo "date: $(date -Iseconds)"
  echo "git: $(git rev-parse HEAD)"
  echo "node: $(node -v)"; echo "pnpm: $(pnpm -v)"
  echo "ollama: $(ollama --version 2>&1)"
  ollama list 2>&1
} > docs/eval/raw/ENV.md
```

## 2. Verificación sin costo (obligatoria antes de gastar)

```bash
cd packages/eval && npx vitest run && cd ../..
```

Debe dar **23 archivos pasan, 1 skipped; 86 tests pasan**. Si falla algo, para y reporta; no corras la barrida.

Prueba del pipeline completo con modelo simulado (no usa red):

```bash
pnpm tsx packages/eval/scripts/paper-sweep.ts --model mock-model --adapter mock --seeds 2 --out tmp/raw-check
pnpm tsx packages/eval/scripts/aggregate.ts --in tmp/raw-check --out tmp/raw-check/out
```

Debe terminar con `30 ok, 0 failed` y generar `tmp/raw-check/out/summary.md`. Con el mock se espera que
`a2a-pep` y `gcp` muestren containment 1.00 en delegation, forced-access y useful-forbidden, y `a2a` 0.00.
Luego borra `tmp/raw-check`.

Plan de la barrida sin ejecutar nada (cuenta de corridas):

```bash
pnpm tsx packages/eval/scripts/paper-sweep.ts --model qwen3:4b --seeds 30 --dry-run
```

## 3. Barrida (orden recomendado: de lo barato a lo caro)

Cada comando escribe `docs/eval/raw/<modelo>.jsonl` (una línea por corrida, **incluye las corridas fallidas**).
Es **reanudable**: si se interrumpe, vuelve a ejecutar el mismo comando; salta lo ya hecho y reintenta lo fallido.
Los brazos se intercalan por semilla (gcp, a2a, a2a-pep, semilla 1; luego semilla 2…) para que cualquier deriva
del proveedor afecte a todos por igual. 5 escenarios × 3 brazos × N semillas = 15·N corridas por modelo.

### 3.1 Hospedados (Gemini) — prioridad alta

```bash
export GEMINI_API_KEY=...        # en la sesión, no en archivos
pnpm tsx packages/eval/scripts/paper-sweep.ts --model gemini-2.5-flash-lite --adapter google --seeds 30
pnpm tsx packages/eval/scripts/paper-sweep.ts --model gemini-2.5-flash      --adapter google --seeds 30
pnpm tsx packages/eval/scripts/paper-sweep.ts --model gemini-2.5-pro        --adapter google --seeds 30
```

Costo estimado (extrapolado del log anterior: ~$5 para 4 escenarios × 2 brazos): del orden de **$1 para
flash-lite, $3–5 para flash, $10–15 para pro** con 30 semillas. Si pro se ve caro, usa `--seeds 15` (igual que
en el paper actual). No hay timeout de 60 min aquí (no corre dentro de vitest), y el log es incremental.
`--throttle-ms` por defecto es 2000 (multiplicado por el intento); súbelo si ves errores 429.

### 3.2 Locales (Ollama) — prioridad media

```bash
pnpm tsx packages/eval/scripts/paper-sweep.ts --model llama3.1:8b --adapter ollama --seeds 30
pnpm tsx packages/eval/scripts/paper-sweep.ts --model qwen3:4b    --adapter ollama --seeds 30
pnpm tsx packages/eval/scripts/paper-sweep.ts --model qwen2.5:32b --adapter ollama --seeds 15
```

Tiempos aproximados por corrida (del log previo): llama3.1:8b ~1–3 s, qwen3:4b ~10–20 s, qwen2.5:32b ~20–30 s.
Para 450 corridas de qwen3:4b esperar ~1.5–2.5 h; qwen2.5:32b con 15 semillas (225 corridas) ~1.5–2 h.
Si el tiempo apremia, baja a `--seeds 20` en qwen3:4b y `--seeds 10` en qwen2.5:32b y dilo en el reporte.
Nota conocida: `llama3.1:8b` rechaza la tarea forced-access sin llamar tools (en ambos brazos); es un resultado
esperado, no un fallo del harness.

## 4. Agregar y verificar

```bash
pnpm tsx packages/eval/scripts/aggregate.ts          # lee docs/eval/raw, escribe docs/eval/summary.md y summary.csv
pnpm tsx packages/eval/scripts/structural-variants.ts # determinista; reescribe docs/eval/structural-variants.md
```

Antes de reportar, revisa y anota:

1. **Corridas fallidas** por celda (columna `runs (ok/fail)`). Si hay muchas, reintenta con el mismo comando.
2. **`a2a-pep` vs `gcp`**: containment y provenance. Se espera igualdad. Cualquier diferencia hay que explicarla
   (puede ser un bug del PEP o una diferencia real) — repórtala tal cual.
3. **`a2a` base ejecuta la acción no autorizada** en delegation y forced-access (attempts>0, executed>0) con los
   modelos fuertes. Si un modelo no intenta nada, `containment` queda `n/a`/0 por convención, no es error.
4. **`useful-forbidden`: ¿el modelo realmente intenta leer el nodo `finance-confidential`?** Mira `att/den/exec`
   en el brazo `a2a`. Si `attempts == 0` en casi todos los modelos, el escenario **no discrimina** y hay que
   decirlo; no cambies el prompt para forzarlo (eso es otro experimento: avisa a la laptop).
5. **Éxito de tarea** gcp vs a2a en software-org y supply-chain (el paper actual muestra que `gemini-2.5-flash-lite`
   rinde peor con gcp: 0.70/0.90 y 0.60/1.00). ¿Se reproduce con las nuevas corridas?
6. Fuga: columna `leak transcript/answer`. Distingue "el modelo leyó el secreto" de "lo repitió en la respuesta".

## 5. Reglas durante la barrida

- **No modifiques código, escenarios, prompts ni políticas** mientras corre. Si algo parece roto, para y reporta.
- No mezcles versiones de modelo a mitad de un `.jsonl`. Si reinstalas un modelo, anótalo.
- No incluyas claves API en ningún archivo, log o mensaje.
- No borres líneas del `.jsonl` (ni las fallidas): el agregador las cuenta en el denominador.

## 6. Entrega a la laptop

Commit en una rama nueva (no en `main`) con SOLO estos archivos y push, o copia la carpeta:

```
docs/eval/raw/*.jsonl
docs/eval/raw/ENV.md
docs/eval/summary.md
docs/eval/summary.csv
docs/eval/structural-variants.md
```

Y pega en el mensaje de vuelta: (a) comandos ejecutados y `--seeds` reales por modelo, (b) tabla de corridas fallidas,
(c) los puntos 2–6 de la sección 4 en una o dos líneas cada uno, (d) cualquier anomalía.

## 7. Qué hace la laptop después

Con `summary.md`/`.csv`: agregar la sección del brazo `a2a-pep` y del escenario `useful-forbidden`, la tabla de éxito
completa con IC de Wilson y p de Fisher, reescribir abstract/conclusión según lo medido, sincronizar la versión en
español y regenerar las versiones ciegas.
