# GCP vs A2A — Propuesta de valor para tareas long-running y agentes con heartbeat

> Documento de posicionamiento. Explica *por qué* Graph Context Protocol (GCP) le gana
> a la mensajería punto-a-punto estilo A2A, específicamente para **agentes autónomos
> long-running** que emiten **heartbeats** (señales periódicas de liveness/progreso).
> Complementa a [11-direction.md](./11-direction.md) (dirección de ingeniería) y
> [12-research-and-evaluation.md](./12-research-and-evaluation.md) (tesis de investigación).

> **Leyenda de estado.** Cada fila/claim lleva etiqueta:
> **[implementado]** = existe en código hoy · **[objetivo]** = diseñado-para, aún no implementado.
> El núcleo read-first (context-query + role-gating + provenance) está **[implementado]**.
> La superficie de heartbeat / long-running-task descrita aquí es **[objetivo]** — es la
> estrella polar que este documento argumenta, no una descripción del código actual.

---

## 1. Posicionamiento en una línea

**A2A** hace que un agente long-running **empuje** (push) su estado a todos los que
les interesa — chatty, N×N, y el estado desaparece en cuanto el mensaje se entrega.

**GCP** hace que un agente long-running **escriba su heartbeat/progreso/resultado en su
propio nodo de conocimiento role-gated**, y deja que supervisores, peers y humanos
**lean** (pull) el estado autorizado bajo demanda. La fuente de verdad se queda con el
agente dueño del trabajo; los lectores reciben lecturas filtradas y auditadas — no un
broadcast.

> La federación de contexto read-first encaja mejor con el trabajo long-running que la
> mensajería, porque el trabajo long-running es esencialmente **"estado que sobrevive al
> mensaje."** A2A modela el estado como un flujo de pushes efímeros; GCP lo modela como
> una superficie propia, queryable y acotada por policy.

---

## 2. La propuesta de valor real

Para una flota de agentes autónomos long-running (tareas que corren de minutos a días,
con reinicios, supervisores y humanos asomándose):

1. **El estado es un *lugar*, no un *evento*.** El agente posee un nodo
   `task-status` / `heartbeat`. "¿Dónde va la tarea X?" es una lectura contra ese nodo
   — no un log de mensajes re-reproducido. **[objetivo]**
2. **Pull le gana al broadcast en fan-out.** Un agente, M observadores (supervisor,
   dashboard, agentes hermanos, humano). A2A = M pushes por update. GCP = 1 escritura,
   M lecturas **bajo demanda** — los observadores que no miran no cuestan nada. **[objetivo]**
3. **Sobrevive crashes y reconexiones.** El heartbeat vive en el grafo del dueño. Un
   agente que reinicia, o un supervisor que reconecta, lee el *último heartbeat
   conocido* en vez de haberse perdido los mensajes en vuelo. **[objetivo]**
4. **Estado de mínimo privilegio.** Un agente contratista ve "running / done / failed";
   el equipo dueño ve progreso completo + artefactos intermedios. Mismo nodo,
   role-gated en la fuente. **[implementado — role-gating]** / **[objetivo — schema de estado]**
5. **Cada lectura de estado se audita.** Provenance registra quién chequeó la tarea,
   cuándo, permitido o denegado. Visibilidad grado-compliance sobre la supervisión
   misma. **[implementado — provenance]**
6. **Delegación y supervisión comparten una ruta.** "Haz esta tarea larga" es
   delegación gateada (`cap:delegate-task`); "¿cómo va?" es una lectura del nodo de
   estado. Mismo modelo de auth, dos niveles de capability.
   **[implementado — gate de delegación]**

---

## 3. Tabla comparativa — GCP vs A2A

| Dimensión | A2A (baseline mensajería) | GCP (federación read-first) | Estado |
| --- | --- | --- | --- |
| **Modelo de interacción** | Push: el agente manda mensajes de estado a los observadores | Pull: el agente escribe estado en su propio nodo; los observadores lo queryean | núcleo [implementado] · nodo estado [objetivo] |
| **Estado long-running** | Flujo de mensajes de update efímeros; hay que reproducirlos para reconstruir | Nodo `task-status` propio; el estado actual es una lectura | [objetivo] |
| **Heartbeat / liveness** | Ping periódico en broadcast a cada interesado | Nodo `heartbeat` con `lastSeen` / `phase` / `progress`; lectura bajo demanda | [objetivo] |
| **Costo fan-out (M observadores)** | O(M) pushes por update | 1 escritura + lecturas solo por los que realmente miran | [objetivo] |
| **Crash / reconexión** | Mensajes en vuelo perdidos; el observador debe resincronizar | Último heartbeat legible desde el grafo del dueño tras reinicio | [objetivo] |
| **Coupling / scaling (N agentes)** | Cada observador debe conocer cada agente (~O(N²) acquaintance) | Descubrir + queryear por node id (~O(N)) | núcleo [implementado] · medido en eval |
| **Fuente de verdad** | Copiada en cada mensaje de estado | Se queda con el agente dueño; los lectores reciben resultados filtrados | [implementado] |
| **Autorización** | Por-mensaje, ad-hoc, varía por integración | Policy del dueño por nodo: `readableByRoles` + `requiredCapabilities` | [implementado] |
| **Leakage de estado** | Sobre-compartir en respuestas verbosas | Filtrado en la fuente; lectura denegada nunca toca el adapter | [implementado] |
| **Vistas de mínimo privilegio** | Difícil — mismo cuerpo de mensaje a todos | Mismo nodo devuelve distinta superficie por rol | gate [implementado] · forma de estado por-rol [objetivo] |
| **Auditabilidad de la supervisión** | Dispersa entre logs de mensajes | `provenance` por lectura: quién/qué/cuándo, allow/deny, roles/caps casados | [implementado] |
| **Delegación de la tarea** | Mandar mensaje de tarea + trackear correlation id a mano | `cap:delegate-task` gateado en la misma ruta query/response | [implementado] |
| **Backpressure** | El emisor marca el ritmo; observador lento se inunda o pierde | El lector marca el ritmo; lee cuando está listo | [objetivo] |
| **Identidad / confianza** | Por-integración, a menudo implícita | `Principal` autenticado; el campo `requester` es solo-auditoría, nunca se confía | [implementado] |
| **Confianza cross-owner** | Integraciones bilaterales N×N | Cada dueño aplica auth/policy local; sin grafo central | núcleo [implementado] · identidad cross-owner firmada [objetivo, gap] |

---

## 4. El modelo long-running al que queremos llegar (objetivo)

Un agente autónomo long-running es un **nodo GCP dueño de su propia superficie de
trabajo**:

```
nodo agente "node:worker-7"
├── knowledge:worker-7-heartbeat   { phase, progress, lastSeen, leaseUntil }   # liveness
├── knowledge:worker-7-status      { taskId, state, startedAt, etaHint }        # vista supervisor
├── knowledge:worker-7-events      [ log append-only de progreso / decisiones ] # auditoría / replay
└── knowledge:worker-7-result      { artifact | error }                         # salida final
```

- **Heartbeat = nodo de conocimiento, no broadcast.** El agente actualiza `lastSeen` /
  `phase` a su propio ritmo. La liveness se vuelve un query: "¿está vivo `node:worker-7`
  y pasó la fase 3?" — una lectura role-gated, no una suscripción a pings.
- **Supervisión = read-first.** Un agente supervisor o dashboard humano *jala* (pull) el
  estado a su propio ritmo. Sin contabilidad de suscripciones, sin resync de mensajes
  perdidos.
- **Resumibilidad.** El nodo de estado/heartbeat es la fuente de verdad durable. Agentes
  reiniciados y supervisores que reconectan leen el último estado conocido en vez de
  reproducir un flujo de mensajes.
- **Disclosure progresivo role-gated.** Principals externos/contratistas leen estado
  grueso (`running`/`done`/`failed`); el equipo dueño lee progreso fino y artefactos
  intermedios — todo desde el mismo nodo, filtrado en la fuente.
- **La delegación cierra el loop.** "Arranca esta tarea larga" es delegación gateada; el
  delegador luego *lee* el nodo de estado/heartbeat resultante para seguir el progreso —
  un modelo de auth, dos niveles de capability (`read` vs `cap:delegate-task`).

### Lo que esto necesita y aún no existe (gaps)

- **[objetivo]** Schema de nodo heartbeat/status + una ruta de write/update (hoy GCP es
  read-first only; los nodos de estado implican una superficie de escritura local del
  dueño).
- **[objetivo]** Semántica de lease / TTL en heartbeats (`leaseUntil`) para que un
  heartbeat viejo se lea como "muerto", no como "idle".
- **[objetivo]** Tipo de nodo log/event append-only para progreso reproducible.
- **[gap, seguridad]** Credenciales firmadas y con expiración + verificación de identidad
  cross-owner. La auth actual es un token de secreto compartido sin firma en un Map
  estático en-proceso — bien para demo, **no** suficiente para supervisión long-running
  cross-owner. Ver [12-research-and-evaluation.md](./12-research-and-evaluation.md) y las
  notas de auth en [11-direction.md](./11-direction.md).

---

## 5. El ángulo falsable (para el paper)

Los claims de este documento alimentan la tesis existente: fija el LLM y la tarea, swap
solo la capa de interop, y mide supervisión long-running específicamente.

- **Hipótesis:** para una tarea long-running observada por M supervisores a lo largo de
  T intervalos de heartbeat, el tráfico de estado A2A escala ~O(M · T) mensajes mientras
  GCP escala ~O(T) escrituras + O(lecturas-realmente-emitidas), a igual calidad de
  supervisión (misma capacidad de responder "¿dónde va la tarea X / está viva?").
- **Métricas:** mensajes/escrituras intercambiados, tokens, tasa de updates perdidos
  ante una reconexión simulada, canaries de leakage de estado llegando a un observador
  sub-privilegiado, completitud del provenance del rastro de supervisión.
- **Falsificador:** si un baseline A2A iguala a GCP en tráfico, leakage y costo de resync
  a igual calidad de supervisión, la propuesta de valor long-running falla.

---

*Documentos complementarios:* [11-direction.md](./11-direction.md) ·
[12-research-and-evaluation.md](./12-research-and-evaluation.md)
