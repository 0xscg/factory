import { GotenbergRenderer } from "@factory/core/reporting";
import { generateInspectionPackPdf } from "@factory/core/reporting";
import skin from "../../../../skin.config";
import { requireOrg } from "@/server/context";
import { env } from "@/server/env";
import { getOrgName } from "@/server/queries";

const PACK = skin.reports.find((r) => r.key === "inspection-pack");
const ENTITY_TITLES: Record<string, string> = {
  waste_receipt: "Waste receipts",
  waste_carrier: "Carriers",
  site_record: "Sites",
};

/** One-click inspection-ready pack: records + evidence index + audit extract. */
export async function GET() {
  const { db, ctx } = await requireOrg();
  if (!PACK) return new Response("Report not configured", { status: 500 });
  const orgName = await getOrgName(db, ctx.orgId);
  try {
    const { pdf } = await generateInspectionPackPdf(
      db,
      ctx,
      {
        title: PACK.title,
        orgName,
        footerText: skin.brand.footerText,
        entityTypes: PACK.entityTypes.map((key) => ({
          key,
          title: ENTITY_TITLES[key] ?? key,
        })),
      },
      new GotenbergRenderer(env.GOTENBERG_URL),
    );
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="wasteduty-inspection-pack-${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[wasteduty] inspection pack render failed", err);
    return new Response(
      "PDF generation is unavailable (is the Gotenberg service running?). The pack was audited as attempted; try again shortly.",
      { status: 502 },
    );
  }
}
