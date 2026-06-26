import { and, eq } from "drizzle-orm";
import { db } from "../index";
import { integrationCredentials } from "../schema";
import { encryptJson, decryptJson } from "../crypto";

type IntegrationType = (typeof integrationCredentials.$inferSelect)["integrationType"];
export type IntegrationSecret = { apiKey: string };

export async function saveIntegrationCredentials(
  companyId: string,
  integrationType: IntegrationType,
  secret: IntegrationSecret,
  opts: { livemode: boolean; metadata?: Record<string, unknown> },
): Promise<void> {
  const encrypted = encryptJson(secret);
  await db
    .insert(integrationCredentials)
    .values({
      companyId,
      integrationType,
      secret: encrypted,
      livemode: opts.livemode,
      metadata: opts.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: [integrationCredentials.companyId, integrationCredentials.integrationType],
      set: {
        secret: encrypted,
        livemode: opts.livemode,
        metadata: opts.metadata ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function getDecryptedIntegrationSecret(
  companyId: string,
  integrationType: IntegrationType,
): Promise<IntegrationSecret | null> {
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.companyId, companyId),
        eq(integrationCredentials.integrationType, integrationType),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row ? decryptJson<IntegrationSecret>(row.secret) : null;
}

export async function deleteIntegrationCredentials(
  companyId: string,
  integrationType: IntegrationType,
): Promise<void> {
  await db
    .delete(integrationCredentials)
    .where(
      and(
        eq(integrationCredentials.companyId, companyId),
        eq(integrationCredentials.integrationType, integrationType),
      ),
    );
}
