import { AskChat } from "@/components/ask-chat";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AskPage() {
  await requireAdmin("/demander");
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader eyebrow="Espace administration" title="Demander à Cohérence-Politique" description="Cohérence-Politique répond en interrogeant la base (scrutins classifiés, positions, programmes, prises de parole) et cite les votes qu'il utilise. Chaque question consomme votre abonnement ou votre clé API." />
      <AskChat />
    </div>
  );
}
