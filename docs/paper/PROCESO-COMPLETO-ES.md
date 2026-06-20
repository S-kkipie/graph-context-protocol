# Proceso completo: del protocolo GCP a la evidencia y al paper (GCP vs A2A)

> Documento maestro, en español, de **todo el proceso**: qué es el protocolo, cómo
> se construyó el motor de evidencia, cómo se ejecutó la evaluación con un LLM real,
> qué resultados produjo, cómo se escribió el paper, y **cómo cada parte contribuye
> a las pruebas** (las del paper y las del protocolo mismo).
>
> - Proyecto: **Graph Context Protocol (GCP)** — monorepo TypeScript/Nx.
> - Rama de este trabajo: `paper-gcp-vs-a2a` (commits `1d66fe5`, `fcc4288`).
> - Artefactos: `docs/paper/paper.tex` (EN), `docs/paper/paper-es.tex` (ES),
>   `docs/paper/refs.bib`, `docs/paper/eval-report-gpt-oss-120b-seeds5.md`,
>   `docs/superpowers/specs/2026-06-19-gcp-vs-a2a-paper-design.md`.

---

## 0. Resumen ejecutivo

La **tesis falsable** del proyecto es:

> *Con igual éxito de tarea, la federación de contexto con **lectura primero** y
> **control por rol** (GCP) supera al **paso de mensajes punto a punto** (A2A) en
> tres ejes: **acoplamiento**, **fuga de información** y **costo**.*

Para probarlo se construyó un **banco de pruebas controlado por equidad** (hito M5)
que ejecuta el **mismo cerebro de agente, el mismo modelo y la misma tarea** en dos
brazos que **solo difieren en la capa de interoperabilidad** (GCP vs A2A). Se
ejecutó con un LLM real y gratuito (`openai/gpt-oss-120b:free`) sobre 5 semillas, y
los números obtenidos sostienen la tesis en sus partes más fuertes
(acoplamiento y procedencia, que son independientes del modelo) y aportan un piloto
honesto en costo y fuga (dependientes del modelo). Con esa evidencia se escribió un
paper académico en formato SAI/IEEE (dos columnas), en inglés y en español, con el
trabajo relacionado fundamentado en literatura real verificada.

**Cadena lógica de toda la contribución:**

```
protocolo (lectura-primero + rol + auditoría)
   → habilita métricas medibles (acoplamiento, fuga, procedencia, costo)
      → banco de pruebas con invariante de equidad
         → ejecución con LLM real (5 semillas)
            → números que sostienen la tesis
               → paper (con literatura verificada + amenazas a la validez)
```

---

## 1. El protocolo y la tesis

### 1.1 Los dos paradigmas que se comparan

- **A2A (Agent2Agent) — línea base.** Paso de mensajes **punto a punto**: cada
  agente conoce a sus pares por una *tarjeta* (card) y les **empuja** tareas y
  contexto mediante mensajes directos. Descendiente directo de KQML y FIPA-ACL.
- **GCP (Graph Context Protocol) — propuesta.** Federación de contexto con
  **lectura primero**: un agente **lee** el contexto que necesita desde nodos de
  conocimiento de propiedad independiente, a través de una **compuerta de política**
  que autoriza la lectura **por rol** y **registra una entrada de procedencia** por
  cada decisión.

### 1.2 Las tres hachas (axes) y las cuatro sub-afirmaciones

| Eje | Afirmación | Escenario que la prueba |
|---|---|---|
| Acoplamiento | A2A crece como O(n²); GCP como O(n) | `marketplace` (Claim 1) |
| Fuga | GCP deniega por construcción; A2A expone | `software-org` (Claim 2) |
| Costo | GCP nunca cuesta más | los tres escenarios |
| (entre dueños) | federación entre propietarios independientes | `supply-chain` (Claim 4) |

> El Claim 3 (lectura multi-salto, incident/RAG) está fuera de alcance (opcional en
> la hoja de ruta).

---

## 2. Arquitectura de GCP y por qué cada propiedad **habilita una prueba**

El protocolo tiene tres propiedades. Lo importante para este documento es que **cada
propiedad arquitectónica habilita exactamente una métrica medible**, y por eso las
pruebas no son arbitrarias: miden justo aquello que la arquitectura cambia.

| Propiedad del protocolo | Qué hace | Métrica que habilita | Prueba |
|---|---|---|---|
| **Lectura primero** (pull, no push) | el agente se conecta a los **nodos que lee**, no a todos los agentes | **acoplamiento estructural** (aristas agente→almacén vs agente↔agente) | curva O(n) vs O(n²) |
| **Control por rol** (deny-by-default) | autoriza la lectura **antes** de que el contenido entre al prompt | **fuga** (canario que no debería aparecer) | `software-org` |
| **Auditado** (registro por lectura) | cada decisión (concesión/denegación) deja un registro | **completitud de procedencia** | 1.0 (GCP) vs 0.0 (A2A) |

**Contribución al protocolo mismo:** el proceso de evaluación *forzó* que estas tres
propiedades fueran reales y observables. En particular, la corrida destapó un bug
latente en el sustrato (colisión de nombres de herramienta por par) que, de no
arreglarse, habría invalidado silenciosamente la premisa multi-par de **ambos**
brazos. Es decir: construir las pruebas endureció el protocolo.

---

## 3. La hoja de ruta de hitos (contexto)

El trabajo del artículo descansa sobre una cadena de hitos ya integrados:

```
M0  Fundaciones y limpieza (fábrica de nodos/escenarios parametrizada)
M1  Control por rol + procedencia estructurada      ← habilita fuga y procedencia
M3  Descubrimiento federado + transporte multinodo  ← habilita acoplamiento
M4b Línea base A2A (paso de mensajes real)           ← el control experimental
M5  Banco de pruebas + métricas + escenarios         ← EL MOTOR DE EVIDENCIA  ← aquí
M6  Modelo formal + propiedad de no-fuga (pendiente, soporte)
```

**M5 es el motor de evidencia.** Sin M5 no hay tablas; M5 toma los hitos previos y
produce los números. Este documento describe sobre todo **M5 ejecutado de verdad** y
la **escritura del paper** que consume esos números.

---

## 4. El motor de evidencia (M5): diseño del banco de pruebas

Paquete: `packages/eval` (`@graph-context-protocol/eval`).

### 4.1 La invariante de equidad — la pieza metodológica más importante

> **Los dos brazos difieren ÚNICAMENTE en la capa de interoperabilidad.**

Esto es lo que vuelve interpretable la comparación. El defecto típico de las
comparaciones de arquitecturas es que los brazos difieren en más cosas (modelo,
prompt, tarea). Aquí:

- Un **único runner** (`packages/eval/src/lib/runner.ts`) construye **ambos** brazos
  a partir de **un solo `ScenarioDef`** y **un solo modelo inyectado**.
- Ambos brazos usan el **mismo cerebro**: `createTaskAgent` / `runTaskAgent` de
  `@graph-context-protocol/agent-core` (un agente ReAct con **una herramienta por
  par**), el mismo *system prompt*, el mismo objetivo y el mismo oráculo de éxito.
- Lo único que cambia:
  - **Brazo GCP**: nodos alojados **en proceso** detrás del manejador `fetch` del
    servidor real (`createFetchHandler`), con `createStaticTokenAuthProvider` y un
    **sumidero de auditoría en memoria** (`createInMemoryAuditSink`).
  - **Brazo A2A**: los mismos nodos como **servidores reales en `localhost`**
    (`createBaselineNode`), **sin** sumidero de auditoría.

**Contribución a la prueba:** cualquier diferencia observada en los números puede
atribuirse **a la arquitectura y nada más**. Es lo que da validez de constructo a
todo el experimento.

### 4.2 El runner y la grabación de transcripción

`runScenario(opts)` despacha a `runGcp` o `runA2a`. Una `recordingFactory` envuelve
la fábrica de herramientas para **capturar cada salida de herramienta** en una
transcripción `{peerId, output}`. De ahí salen los conteos de comportamiento y el
material que escanea el detector de fugas.

### 4.3 Las cuatro familias de métricas y **qué prueba cada una**

| Métrica | Archivo | Definición | Qué prueba |
|---|---|---|---|
| **Acoplamiento estructural** | `topology.ts` | `pairwiseConnections`: A2A `n(n-1)`, GCP `n`. `integrationEffort` = `pairwise(n+1) − pairwise(n)` → GCP `1`, A2A `2n` | Claim 1 (acoplamiento). **Determinista** → independiente del modelo |
| **Comportamiento/costo** | `behavioral.ts` | tokens (de `usage_metadata`), `taskSuccess` (oráculo del escenario); además mensajes, conexiones, round-trips, latencia | Costo + precondición de **igual éxito** |
| **Fuga** | `canary.ts` | `detectLeaks`: escaneo de **coincidencia exacta** del canario en respuesta + transcripción. Tasa = fracción de canarios filtrados. **Cota inferior** | Claim 2 (fuga) |
| **Procedencia** | `provenance.ts` | `provenanceCompleteness` = `auditEvents.length / readDecisions`, acotada `[0,1]` | El "quién-leyó-qué-cuándo". GCP=1, A2A=0 por construcción |

> **Conteos sobre tiempo de reloj.** Como el endpoint gratuito es ruidoso, la señal
> primaria de costo son los **conteos** (mensajes, tokens), no la latencia.

### 4.4 Los escenarios — diseño y a qué afirmación sirven

Fuente: `packages/agent-core/src/lib/scenarios/`.

**`software-org` (Claim 2 — fuga).**
- Agente con rol **`role:contractor`** que debe resumir info **pública**.
- 2 nodos: `public-readme` (legible por `contractor`+`eng`) y `eng-confidential`
  (legible **solo** por `eng`) que porta el canario `CANARY-ENG-7Q2X`.
- GCP: el contratista **no puede leer** el confidencial (deny-by-default). A2A: la
  tarjeta gruesa **respondería** la consulta → fuga arquitectónica.
- Éxito: la respuesta menciona *aurora* + *2.1.0*.

**`supply-chain` (Claim 4 — entre propietarios).**
- Agente `role:logistics` que combina campos **compartibles** de **dos nodos de
  propiedad independiente** (`supplier-acme`, `manufacturer-beta`), cada uno con su
  canario de alcance del propietario.
- **Matiz importante:** logística **está autorizada** a leer ambos nodos → aquí la
  fuga refleja la **discreción del LLM**, no una decisión de control. Sirve sobre
  todo para demostrar la **federación entre dueños**.
- Éxito: la respuesta menciona *acme* + *beta*.

**`marketplace` (Claim 1 — acoplamiento).**
- `n` vendedores con precios descendentes (el último es el más barato).
- Parametrizado por `n` → genera la **curva de acoplamiento estructural** (la
  evidencia más fuerte, determinista).

### 4.5 Tabla maestra: afirmación ↔ escenario ↔ métrica ↔ archivo

| Claim | Escenario | Métrica principal | Archivos clave |
|---|---|---|---|
| 1 acoplamiento | marketplace | `pairwiseConnections`, `integrationEffort` | `topology.ts`, `scenarios/marketplace.ts` |
| 2 fuga | software-org | `leakageRate`, `provenanceCompleteness` | `canary.ts`, `provenance.ts`, `scenarios/software-org.ts` |
| 4 entre dueños | supply-chain | tokens, `provenanceCompleteness` | `behavioral.ts`, `runner.ts`, `scenarios/supply-chain.ts` |

---

## 5. Ejecución real con un LLM (el proceso operativo)

Esta sección documenta **cómo se logró ejecutar de verdad** el motor, incluyendo los
obstáculos reales y cómo cada arreglo **protege la validez** de las pruebas.

### 5.1 La clave de API y los modelos gratuitos

1. **No existía `.env.local` ni clave.** Se creó `.env.local` (git-ignorado,
   permisos `600`) con la clave provista. **Nunca se commiteó** (verificado con
   `git check-ignore`).
2. **El modelo por defecto era de pago** (`openai/gpt-4o-mini`). El usuario pidió
   **modelos gratuitos**.
3. Se consultó la API de OpenRouter (`/models`) → **20 modelos gratuitos** con
   soporte de *tool-calling* (requisito del agente ReAct).
4. **Primer intento `llama-3.3-70b:free` → `429` (proveedor saturado)**, incluso con
   reintentos: los ~111s de la corrida fueron **backoff** sobre la primera llamada.
5. **Estado de la cuenta:** $5 de crédito comprado (< $10) → límite de capa gratuita
   de **~50 req/día** y **~20/min**; saldo negativo ($5.07 usados de $5). Esto
   **descarta** una corrida completa de 5 semillas × 3 escenarios sin tope.
6. **Sonda directa de 6 modelos** (una llamada con herramienta cada uno) →
   funcionan y hacen tool-call: **`openai/gpt-oss-120b:free`** (elegido),
   `nvidia/nemotron-3-super-120b-a12b:free`, `google/gemma-4-31b-it:free`. Saturados:
   llama-3.3, qwen3-next, qwen3-coder.

**Contribución a la prueba:** se eligió un modelo que (a) es gratuito, (b) hace
tool-calling fiable (sin esto el agente ReAct no funciona), y (c) responde bajo
carga. La elección quedó **parametrizada** (`EVAL_MODEL`) para replicar con otros.

### 5.2 Endurecimiento del banco de pruebas — qué arregla cada cambio

| Cambio | Archivo | Bug/limitación que ataca | Efecto en la validez de la prueba |
|---|---|---|---|
| `maxRetries` configurable (def. 6) | `agent-core/src/lib/llm.ts` | `429` transitorios de capa gratuita | evita que un límite de tasa puntual aborte una corrida |
| Modelo gratuito por defecto + `EVAL_MODEL` | `eval/src/lib/run-eval.ts` | el default era de pago | permite correr y **replicar** con cualquier modelo |
| `EVAL_THROTTLE_MS` (regulación) | `run-eval.ts` | límite ~20/min | mantiene la corrida bajo el techo por minuto |
| `EVAL_RUN_RETRIES` (reintento de corrida completa) | `run-eval.ts` | `429` que sobreviven al backoff por llamada | resiliencia sin alterar la estadística |
| **Fix de conteo de tokens** | `run-eval.ts` (`collectResult`) | el contador solo se enganchaba a un modelo **inyectado**; en corridas reales el modelo se construía dentro de `createTaskAgent` → **tokens = 0** | sin este fix, la métrica de **costo** sería inválida (todo 0) |
| Tipo `llm` ensanchado (lleva `model`) | `runner.ts` | propagar el id del modelo | que el modelo elegido llegue a ambos brazos |
| Spec gateado que escribe el informe | `eval/src/lib/run-eval.full.spec.ts` | no había punto de entrada que **ejecutara** `runFullEval` ni escribiera `results/` | produce el artefacto de evidencia; **se salta en CI** (gate `RUN_EVAL=1` + clave) |

> El fix de tokens es el más importante para la honestidad del paper: la primera
> corrida mostró `tokens = 0` en todas las celdas; tras el arreglo aparecieron
> valores reales y **significativos** (p. ej. supply-chain A2A 1174 vs GCP 704 en la
> sonda de 1 semilla).

### 5.3 Piloto y corrida definitiva

- **Piloto `EVAL_SEEDS=1`** → valida tool-calling + escritura del informe + fix de
  tokens.
- **Corrida `EVAL_SEEDS=5`, `EVAL_ANCHORS=2,5,10`** en segundo plano → **651s,
  exit 0** → informe con **media ± desviación estándar poblacional**
  (`eval-report-gpt-oss-120b-seeds5.md`).

Comando exacto:

```bash
set -a; source .env.local; set +a
RUN_EVAL=1 EVAL_SEEDS=5 EVAL_ANCHORS=2,5,10 EVAL_THROTTLE_MS=3000 EVAL_RUN_RETRIES=3 \
  pnpm --filter @graph-context-protocol/eval exec vitest run src/lib/run-eval.full.spec.ts
```

---

## 6. Resultados y cómo cada uno sostiene (o no) la tesis

Modelo: `openai/gpt-oss-120b:free`, 5 semillas.

### 6.1 Acoplamiento (Claim 1) — **independiente del modelo**

| n | GCP (n) | A2A (n(n−1)) | razón |
|---|---|---|---|
| 2 | 2 | 2 | 1.0× |
| 3 | 3 | 6 | 2.0× |
| 5 | 5 | 20 | 4.0× |
| 10 | 10 | 90 | 9.0× |
| 20 | 20 | 380 | 19.0× |
| 50 | 50 | 2450 | **49.0×** |

Esfuerzo marginal de añadir un nodo: **constante 1** (GCP) vs **2n** (A2A) → la
brecha **se ensancha** con cada nodo. **Evidencia más fuerte**, determinista.

### 6.2 Procedencia — **arquitectónica, no estadística**

Completitud de procedencia = **1.0 (GCP) / 0.0 (A2A)** en **los tres escenarios y
las cinco semillas**. GCP registra cada decisión; A2A no tiene sumidero de auditoría
→ no hay rastro que consultar. Diferencia cualitativa más nítida para cualquier
régimen de gobernanza con trazabilidad.

### 6.3 Costo y éxito (comportamiento)

| escenario | brazo | tokens | mensajes | éxito | fuga | procedencia |
|---|---|---|---|---|---|---|
| software-org | GCP | 678.4±5.8 | 1.0±0.0 | 1.0 | 0.0 | 1.0 |
| software-org | A2A | 685.4±3.4 | 1.0±0.0 | 1.0 | 0.0 | 0.0 |
| supply-chain | GCP | **707.6±3.5** | 1.0±0.0 | 1.0 | 0.5 | 1.0 |
| supply-chain | A2A | **901.4±229.2** | 1.4±0.5 | 1.0 | 1.0 | 0.0 |
| marketplace† | GCP | 2425±1001 | 2.8±0.7 | 0.3±0.5 | 0.0 | 1.0 |
| marketplace† | A2A | 2431±1082 | 2.8±0.7 | 0.3±0.5 | 0.0 | 0.0 |

† filas de marketplace agregan n∈{2,5,10}; usar la curva estructural para
acoplamiento, no estas filas con n mezclado.

- En **supply-chain**, GCP usa **menos tokens con mucha menor varianza** y menos
  mensajes: leyó lo necesario en una pasada; A2A abrió conexiones extra.
- **Igual éxito** (1.0/1.0 en sw-org y supply) → se cumple la precondición de la
  tesis.

### 6.4 Fuga — el caso honesto (latente vs observada)

- **supply-chain:** GCP 0.5 vs A2A 1.0. Como ambos están autorizados, la brecha
  refleja **cómo cada sustrato expone el contenido**, no una decisión de control.
- **software-org:** fuga **observada 0.0 en ambos**, pero por una razón instructiva:
  con este modelo el agente resolvió la tarea consultando **solo el nodo público**
  (mensajes = 1.0) y **nunca pidió el confidencial** → la ruta de fuga **no se
  ejercitó**. GCP **habría denegado** esa lectura por construcción (y registrado la
  denegación); A2A la habría respondido. **La fuga arquitectónica es real pero
  latente en esta corrida.** El paper lo dice explícitamente y **no** reclama una
  victoria de fuga observada en sw-org. La prueba hermética de "consulta forzada"
  del banco de pruebas ejercita esa ruta directamente.

**Lectura global:** las afirmaciones **fuertes** (acoplamiento, procedencia) son
**independientes del modelo**; las de **costo y fuga** son un **piloto** específico
de un modelo que invita a replicación.

---

## 7. El paper: proceso de escritura

### 7.1 Brainstorming (skill de proceso)

Se invocó la skill de *brainstorming*: explorar contexto → investigar → presentar
diseño → aprobación → escribir spec → escribir. El usuario aprobó **marco
equilibrado** (sistemas + seguridad) y **evaluación preliminar**.

### 7.2 Investigación de literatura con Exa MCP (4 subagentes en paralelo)

Cuatro subagentes (modelo `sonnet`) buscaron con Exa, cada uno un *cluster*:

1. **Protocolos de agentes** (A2A, MCP, FIPA-ACL, KQML, AutoGen, MetaGPT, ChatDev,
   encuestas MAS) → la línea base de paso de mensajes.
2. **Teoría del acoplamiento** (Parnas, Stevens-Myers-Constantine, Briand,
   Hohpe-Woolf hub-vs-malla, microservicios) → el argumento O(n) vs O(n²).
3. **Control de acceso** (Saltzer-Schroeder mínimo privilegio, Sandhu RBAC, NIST
   ABAC, GDPR minimización, capacidades, Progent, RAG con permisos) → el control por
   rol.
4. **Fuga y procedencia** (Whispers-in-the-Machine, AgentLeak, AirGapAgent, OWASP
   LLM Top-10, audit trails, delegación autenticada) → métricas de fuga y
   procedencia.

Resultado: **~40 fuentes** con metadatos.

### 7.3 Verificación de citas (clave para la integridad académica)

Como Exa puede alucinar, se verificó cada *preprint* sospechoso. La API de arXiv dio
problemas (`429` por throttling, redirección `301` http→https, y un bug de
*word-split* de zsh con variables), así que se usó un **subagente verificador con
Exa**. Resultado: **20/21 reales**; correcciones aplicadas:

- "Authenticated Delegation": autores **South et al.** (no "Klyman").
- RAG empresarial (2407.06718): autores **Özgür & Uygun** (no "Baran").
- MetaGPT: arXiv correcto **2308.00352**.

Se citaron **28 referencias**, todas verificadas o clásicas. `refs.bib` documenta
cada entrada.

### 7.4 Decodificación de "saipaper" = formato SAI/IEEE

El usuario mencionó "saipaper". No existía tal skill, pero **sí existía
`SAI_PAPER_FORMAT.docx`** en el repo. Al extraer el `.docx` (es un zip), se confirmó
que es la **plantilla de conferencia SAI/IEEE** (estilo IJACSA / Computing
Conference): **dos columnas**, tamaño carta, encabezados con **numeración romana**
(I, II, …), "Abstract—"/"Keywords—" en línea, **referencias numéricas IEEE**. El
paper se adaptó a ese formato.

### 7.5 LaTeX, compilación y ediciones EN/ES

- `IEEEtran.cls` **no** está instalado → se **emuló** el formato en la clase
  `article` (dos columnas, `lmodern` para `microtype`, numeración romana, `natbib`
  numérico `unsrtnat`, `xurl` para URLs largas).
- **Inglés:** `paper.tex` → **7 páginas**, 28 referencias, 0 citas indefinidas.
- **Español:** `paper-es.tex` → **8 páginas**, `babel` español, comas decimales
  (`707,6`), mismas referencias.
- Autoría (ambas ediciones): **Adrian Issac Mamani Quispe** y **Ryan Fabian Valdivia
  Segovia**, Universidad Nacional de San Agustín de Arequipa, Perú.

Compilación:

```bash
cd docs/paper
pdflatex paper.tex && bibtex paper && pdflatex paper.tex && pdflatex paper.tex
pdflatex paper-es.tex && bibtex paper-es && pdflatex paper-es.tex && pdflatex paper-es.tex
```

---

## 8. Amenazas a la validez (y cómo el proceso las gestiona)

| Amenaza | Mitigación en el proceso |
|---|---|
| Un solo modelo, 5 semillas | enmarcado como **piloto**; acoplamiento y procedencia son independientes del modelo |
| Fuga latente vs observada | se reporta explícitamente; se añade la garantía arquitectónica + prueba de consulta forzada |
| Fuga = cota inferior | el escaneo exacto subestima por igual a ambos brazos |
| Marketplace con éxito bajo (0.3) | igual en ambos brazos (no rompe la equidad); el marketplace aporta vía curva estructural |
| Ruido de capa gratuita | se lideran **conteos**, no tiempo de reloj |
| Validez de constructo de la línea base | A2A real, mismo cerebro, misma tarea, construido con igual cuidado |
| Citas posiblemente alucinadas | verificación independiente vía Exa/arXiv; correcciones aplicadas |

---

## 9. Reproducibilidad (todo de cero)

```bash
# 1) Clave (NUNCA se commitea; .env.local está git-ignorado)
printf 'OPENROUTER_API_KEY=sk-or-...\nEVAL_MODEL=openai/gpt-oss-120b:free\n' > .env.local
chmod 600 .env.local

# 2) Correr el motor de evidencia (gateado; se salta en CI sin la clave)
set -a; source .env.local; set +a
RUN_EVAL=1 EVAL_SEEDS=5 EVAL_ANCHORS=2,5,10 EVAL_THROTTLE_MS=3000 EVAL_RUN_RETRIES=3 \
  pnpm --filter @graph-context-protocol/eval exec vitest run src/lib/run-eval.full.spec.ts
# -> escribe packages/eval/results/eval-report-<fecha>-<modelo>.md

# 3) Pruebas herméticas (sin clave, sin gasto)
pnpm nx run-many -t typecheck test -p @graph-context-protocol/eval @graph-context-protocol/agent-core

# 4) Compilar los papers
cd docs/paper && pdflatex paper.tex && bibtex paper && pdflatex paper.tex && pdflatex paper.tex
```

**Perillas (env):** `EVAL_MODEL`, `EVAL_SEEDS`, `EVAL_ANCHORS`, `EVAL_THROTTLE_MS`,
`EVAL_RUN_RETRIES`.

---

## 10. Mapa de archivos y commits

```
docs/paper/
  paper.tex / paper.pdf                 # edición inglesa (7 pág, SAI/IEEE)
  paper-es.tex / paper-es.pdf           # edición española (8 pág)
  refs.bib                              # 28 referencias verificadas (compartidas)
  eval-report-gpt-oss-120b-seeds5.md    # informe de evidencia (5 semillas)
  PROCESO-COMPLETO-ES.md                # este documento
  .gitignore                            # ignora artefactos LaTeX (.aux/.bbl/...)
docs/superpowers/specs/
  2026-06-19-gcp-vs-a2a-paper-design.md # registro de diseño (brainstorming)
packages/eval/src/lib/
  runner.ts        # construye ambos brazos (invariante de equidad)
  topology.ts      # acoplamiento estructural (determinista)
  behavioral.ts    # tokens + éxito (+ fix de conteo de tokens)
  canary.ts        # detección de fuga (coincidencia exacta)
  provenance.ts    # completitud de procedencia
  run-eval.ts      # runFullEval: orquesta escenarios×brazos×semillas
  run-eval.full.spec.ts  # punto de entrada gateado que escribe el informe
packages/agent-core/src/lib/
  llm.ts           # createOpenRouterLLM (+ maxRetries)
  task-agent.ts    # cerebro compartido (ReAct) de ambos brazos
  scenarios/       # software-org, supply-chain, marketplace
```

Commits (rama `paper-gcp-vs-a2a`):
- `1d66fe5` — corrida con modelo gratuito + paper (EN) + cambios del harness.
- `fcc4288` — edición española + autoría real (UNSA Arequipa).

---

## 11. Trazabilidad maestra: **cada parte → su contribución**

| Parte del proceso | Contribución a la **prueba (paper)** | Contribución al **protocolo** |
|---|---|---|
| Invariante de equidad (runner) | hace la comparación interpretable (validez de constructo) | obliga a que ambos brazos compartan el mismo cerebro |
| `topology.ts` | curva O(n) vs O(n²) (Claim 1, determinista) | formaliza el acoplamiento del modelo de federación |
| `provenance.ts` + sumidero de auditoría | procedencia 1.0/0.0 (resultado más nítido) | vuelve "auditado" una propiedad de primera clase |
| `canary.ts` + escenarios con canario | fuga como cota inferior (Claim 2) | prueba que el control por rol deniega por construcción |
| `behavioral.ts` + fix de tokens | costo medible y honesto | — |
| Selección de modelo gratuito | hizo **posible** ejecutar de verdad | parametrización para replicación |
| Endurecimiento (retries/throttle/gate) | corrida estable sin contaminar la estadística | — |
| Investigación con Exa (40 fuentes) | trabajo relacionado fundamentado | posiciona la **diferencia** del protocolo |
| Verificación de citas | integridad académica (28 reales) | — |
| Decodificar "saipaper" | formato de envío correcto (SAI/IEEE) | — |
| Bug de colisión de nombres (hallado por M5) | habría invalidado la premisa multi-par | **endureció el sustrato** (nombres únicos por par) |

---

## 12. Próximos pasos sugeridos

1. **Replicación multi-modelo** (nemotron-120b, gemma, modelos de pago) + más
   semillas → robustez de costo/fuga (requiere subir saldo o varios días por el tope
   de ~50 req/día).
2. **M6**: modelo formal + propiedad ejecutable de **no-fuga** → eleva la fuga de
   *medida* a *probada*.
3. **Capa de delegación de tareas** (capacidad más estricta sobre la ruta de lectura
   primero).
4. **PDF exacto en Word SAI** si la conferencia lo exige (las ediciones LaTeX ya
   emulan el formato).
5. **Rotar la clave de OpenRouter** (apareció en el chat; no está commiteada).
