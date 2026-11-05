/**
 * Registro de bajas: quién cae y por qué, resumido en una línea del log del servidor. Sirve para equilibrar
 * con datos: sin esto solo se ve cuántos quedan, no qué los está matando. No toca el juego.
 */
export type Side = "ally" | "invader";

const shortId = (id: string) => id.replace(/^[a-z_]+:/, "");

export class CasualtyLog {
  private readonly counts: Record<Side, Map<string, number>> = { ally: new Map(), invader: new Map() };

  record(side: Side, cause: string, killerId?: string): void {
    const key = killerId ? `${cause}/${shortId(killerId)}` : cause;
    this.counts[side].set(key, (this.counts[side].get(key) ?? 0) + 1);
  }

  /** Devuelve el resumen y vacía la cuenta; `undefined` si no ha caído nadie. */
  flush(): string | undefined {
    const part = (label: string, side: Side) => {
      const entries = [...this.counts[side]].sort((a, b) => b[1] - a[1]);
      if (entries.length === 0) return undefined;
      const total = entries.reduce((sum, [, n]) => sum + n, 0);
      return `${label} ${total} (${entries.map(([key, n]) => `${key} ${n}`).join(", ")})`;
    };
    const parts = [part("aliados", "ally"), part("invasores", "invader")].filter((p) => p !== undefined);
    this.counts.ally.clear();
    this.counts.invader.clear();
    return parts.length > 0 ? `Bajas: ${parts.join("; ")}` : undefined;
  }
}
