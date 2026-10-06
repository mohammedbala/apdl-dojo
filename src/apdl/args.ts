// Field accessors for command handlers. Mirrors ANSYS field rules:
//  - blank fields take defaults
//  - numeric fields are expressions (parameters substituted)
//  - label fields are taken literally (upper-cased)
import type { Ctx } from './context';
import type { Field, Statement } from './lexer';
import { ApdlError } from './diagnostics';
import { isBareIdent, isNumericLiteral, type Value } from './expr';
import type { EntityKind, Id } from '../model/types';
import { entityMap, selectedIds } from '../model/state';

export class Args {
  readonly fields: Field[];
  constructor(
    private ctx: Ctx,
    stmt: Statement,
  ) {
    this.fields = stmt.fields.map((f) => ({ ...f, text: ctx.substitute(f.text) }));
  }

  get count(): number {
    return this.fields.length;
  }

  raw(i: number): string {
    return this.fields[i]?.text ?? '';
  }

  isBlank(i: number): boolean {
    return this.raw(i) === '';
  }

  /** Evaluate a field to a value (number or string). Bare unknown identifiers are returned as labels. */
  value(i: number): Value | undefined {
    const t = this.raw(i);
    if (t === '') return undefined;
    if (isNumericLiteral(t)) return parseFloat(t.replace(/[dD]/, 'e'));
    if (isBareIdent(t)) {
      const up = t.toUpperCase();
      const v = this.ctx.m.params.get(up);
      if (v !== undefined) return v;
      return up;
    }
    try {
      return this.ctx.evaluate(t);
    } catch (e) {
      throw new ApdlError('EXPR', `Cannot evaluate field ${i + 2} "${t}": ${(e as Error).message}`);
    }
  }

  num(i: number, def = 0): number {
    const v = this.value(i);
    if (v === undefined) return def;
    if (typeof v === 'number') return v;
    const t = this.raw(i);
    if (isBareIdent(t)) {
      // ANSYS: undefined parameter in a numeric field -> 0 with a warning
      this.ctx.warn('PARAM_UNDEF', `Parameter ${t.toUpperCase()} is not defined.  A value of zero will be used.`);
      return 0;
    }
    throw new ApdlError('NUMERIC', `Field ${i + 2} ("${t}") must be numeric.`);
  }

  /** Integer field (truncates toward zero, as ANSYS does for entity numbers). */
  int(i: number, def = 0): number {
    return Math.trunc(Math.round(this.num(i, def) * 1e9) / 1e9);
  }

  /** Optional number: undefined when blank. */
  opt(i: number): number | undefined {
    return this.isBlank(i) ? undefined : this.num(i);
  }

  /** Label field: literal, upper-cased; character parameters are substituted. */
  lab(i: number, def = ''): string {
    const t = this.raw(i);
    if (t === '') return def;
    if (/^'.*'$/.test(t)) return t.slice(1, -1).toUpperCase();
    if (isBareIdent(t)) {
      const v = this.ctx.m.params.get(t.toUpperCase());
      if (typeof v === 'string') return v.toUpperCase();
    }
    return t.toUpperCase();
  }

  /** Raw string (for titles, names). */
  str(i: number, def = ''): string {
    const t = this.raw(i);
    if (t === '') return def;
    if (/^'.*'$/.test(t)) return t.slice(1, -1);
    const v = isBareIdent(t) ? this.ctx.m.params.get(t.toUpperCase()) : undefined;
    if (typeof v === 'string') return v;
    return t;
  }

  /** A single entity field (number, ALL or component name) without N1,N2,NINC range semantics. */
  entity1(kind: EntityKind, i: number): Id[] {
    const t = this.raw(i);
    if (t === '') return [];
    if (isBareIdent(t)) {
      const up = t.toUpperCase();
      if (up === 'ALL' || this.ctx.m.comps.has(up) || up === 'P') return this.entities(kind, i);
    }
    return [this.int(i)];
  }

  /**
   * Entity list in the standard N1,N2,NINC form:
   *   N1 = ALL  -> all selected
   *   N1 = component name -> component members
   *   N1 = P    -> picking: not available
   *   N1 blank  -> `blankMeans` ('all' selected or 'none')
   */
  entities(kind: EntityKind, i1: number, blankMeans: 'all' | 'none' = 'none'): Id[] {
    const t = this.raw(i1);
    const m = this.ctx.m;
    if (t === '') return blankMeans === 'all' ? selectedIds(m, kind) : [];
    if (isBareIdent(t)) {
      const up = t.toUpperCase();
      if (up === 'ALL') return selectedIds(m, kind);
      if (up === 'P') throw new ApdlError('PICK', 'Graphical picking (P) is not available in the trainer. Use entity numbers, ALL, or a component name.');
      const comp = m.comps.get(up);
      if (comp) {
        if (comp.kind !== kind) throw new ApdlError('COMP_KIND', `Component ${up} is a ${comp.kind.toUpperCase()} component, not ${kind.toUpperCase()}.`);
        const map = entityMap(m, kind);
        return comp.ids.filter((id) => map.has(id));
      }
      const pv = m.params.get(up);
      if (pv === undefined) throw new ApdlError('COMP_UNDEF', `Component or parameter ${up} is not defined.`);
    }
    const n1 = this.int(i1);
    const n2 = this.isBlank(i1 + 1) ? n1 : this.int(i1 + 1);
    const inc = this.isBlank(i1 + 2) ? 1 : Math.max(1, Math.abs(this.int(i1 + 2)));
    const out: Id[] = [];
    if (n1 < 0) {
      // ANSYS: negative N1 means "use absolute value" in many commands
      out.push(-n1);
      return out;
    }
    for (let n = n1; n <= n2; n += inc) out.push(n);
    return out;
  }
}
