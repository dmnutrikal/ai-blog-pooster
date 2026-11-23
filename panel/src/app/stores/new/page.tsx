import { pipelineStoreSlugs } from "@/lib/stores/pipeline";
import { StoreForm } from "../StoreForm";

export const dynamic = "force-dynamic";

export default async function NewStorePage({ searchParams }: { searchParams: Promise<{ slug?: string }> }) {
  const { slug } = await searchParams;

  return (
    <>
      <h1>Добави магазин</h1>
      <div className="card">
        <p className="small muted">
          Нужен е custom app в магазина с права за четене и запис (Client ID и Client secret). App-ът и магазинът трябва да са в една Shopify организация.
        </p>
        <StoreForm defaults={{ slug }} pipelineSlugs={pipelineStoreSlugs()} />
      </div>
    </>
  );
}
