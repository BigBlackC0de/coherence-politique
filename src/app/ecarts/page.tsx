import { PageHeader } from "@/components/ui";
import { BigGaps } from "@/components/big-gaps";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Les grands écarts",
  description: "Là où le programme, les votes et le discours d'un parti ne vont pas dans le même sens. Avec les preuves.",
};

export default function EcartsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Programme, votes, discours"
        title="Les grands écarts"
        description="Les sujets où ce qu'un parti écrit, ce qu'il vote et ce que disent ses élus ne vont pas dans le même sens. Du plus grand écart au plus petit, avec les mêmes règles pour tous les partis."
      />
      <BigGaps />
    </div>
  );
}
