import { z } from "zod";
import type { ChecklistDef } from "@factory/core/checklists";
import type { DeadlineDef } from "@factory/core/deadlines";
import type { EntityDef } from "@factory/core/records";

/**
 * The skin definition — the factory's input format (architecture §3.3).
 * A skin is this config plus branding plus (optionally) one adapter;
 * everything else is chassis. Entities/checklists/deadlines are the
 * already-validated defs from @factory/core define* helpers.
 */

// Catches inflections (ensuring/guaranteed) with up to three intervening
// words ("ensures full DWT compliance"), and the passive form
// ("compliance is guaranteed"). Approved vocabulary — audit-ready,
// inspection-ready, evidence, records — never matches.
const BANNED_COPY =
  /(ensur|guarantee)\w*\s+(\w+['’-]?\w*\s+){0,3}compliance|compliance\s+(\w+\s+){0,2}(is|are|was|were)?\s*(ensur|guarantee)\w*/i;

/**
 * Rejects the banned legal-posture claim in config-declared strings.
 * Scope is ONLY what defineSkin sees (brand name/tagline, report
 * titles) — landing copy, emails, and checklist labels are NOT screened
 * here and need their own review (reg-copywriter enforces the ban for
 * generated content).
 */
const copySafe = (label: string) =>
  z.string().refine((s) => !BANNED_COPY.test(s), {
    message: `${label} must not claim to ensure/guarantee compliance (copy ban, CLAUDE.md)`,
  });

const brandSchema = z.object({
  name: copySafe("brand.name").pipe(z.string().min(1)),
  domain: z
    .string()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "domain must be a bare hostname"),
  theme: z.string().min(1),
  /** "X is a trading name of [Ltd], Co. no. XXXX" — required, every footer. */
  footerText: z.string().refine((s) => /is a trading name of/i.test(s), {
    message:
      'footerText must carry the trading-name line ("X is a trading name of [Ltd], Co. no. …")',
  }),
  tagline: copySafe("brand.tagline").optional(),
});

const pricingSchema = z.object({
  /** Monthly GBP, VAT-exclusive (architecture §2). */
  starter: z.number().int().positive(),
  pro: z.number().int().positive(),
});

const reportSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  title: copySafe("report.title").pipe(z.string().min(1)),
  /** Entity types included, in display order. */
  entityTypes: z.array(z.string()).min(1),
});

export type SkinReport = z.infer<typeof reportSchema>;
export type SkinBrand = z.infer<typeof brandSchema>;
export type SkinPricing = z.infer<typeof pricingSchema>;

const skinStaticSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9]*$/, "skin id must be lowercase alnum"),
  brand: brandSchema,
  reports: z.array(reportSchema).min(1),
  /** Optional regulator adapter package key (e.g. "dwt-defra"). */
  adapter: z.string().optional(),
  pricing: pricingSchema,
});

export interface SkinConfig extends z.infer<typeof skinStaticSchema> {
  entities: EntityDef[];
  checklists: ChecklistDef[];
  deadlines: DeadlineDef[];
}

export type SkinConfigInput = z.input<typeof skinStaticSchema> & {
  entities: EntityDef[];
  checklists: ChecklistDef[];
  deadlines: DeadlineDef[];
};

/**
 * Validates and freezes a skin config. Cross-checks that every report
 * references only declared entity types, and that entity/checklist/
 * deadline keys are unique — the chassis routes by key.
 */
export function defineSkin(input: SkinConfigInput): SkinConfig {
  const staticPart = skinStaticSchema.parse(input);

  const entityTypes = new Set<string>();
  for (const e of input.entities) {
    if (entityTypes.has(e.type))
      throw new Error(`skin ${staticPart.id}: duplicate entity type ${e.type}`);
    entityTypes.add(e.type);
  }
  const checklistKeys = new Set<string>();
  for (const c of input.checklists) {
    if (checklistKeys.has(c.key))
      throw new Error(
        `skin ${staticPart.id}: duplicate checklist key ${c.key}`,
      );
    checklistKeys.add(c.key);
  }
  const deadlineKeys = new Set<string>();
  for (const d of input.deadlines) {
    if (deadlineKeys.has(d.key))
      throw new Error(`skin ${staticPart.id}: duplicate deadline key ${d.key}`);
    deadlineKeys.add(d.key);
  }
  for (const r of staticPart.reports) {
    for (const et of r.entityTypes) {
      if (!entityTypes.has(et)) {
        throw new Error(
          `skin ${staticPart.id}: report ${r.key} references unknown entity type ${et}`,
        );
      }
    }
  }

  // Freeze the containers the cross-checks above validated — a later
  // push into entities/reports would silently reintroduce exactly the
  // duplicate-key and unknown-entity bugs defineSkin rejects.
  Object.freeze(staticPart.brand);
  Object.freeze(staticPart.pricing);
  staticPart.reports.forEach((r) => {
    Object.freeze(r.entityTypes);
    Object.freeze(r);
  });
  return Object.freeze({
    ...staticPart,
    entities: Object.freeze([...input.entities]) as EntityDef[],
    checklists: Object.freeze([...input.checklists]) as ChecklistDef[],
    deadlines: Object.freeze([...input.deadlines]) as DeadlineDef[],
    reports: Object.freeze(staticPart.reports) as SkinReport[],
  });
}

/** Deadline rules keyed for scanAndNotify. */
export function deadlineRules(skin: SkinConfig): Record<string, DeadlineDef> {
  return Object.fromEntries(skin.deadlines.map((d) => [d.key, d]));
}
