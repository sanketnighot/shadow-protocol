import type { Asset } from "@/data/mock";
import { TokenCard } from "@/components/portfolio/TokenCard";

type AssetListProps = {
  assets: Asset[];
};

export function AssetList({ assets }: AssetListProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {assets.map((asset) => (
        <TokenCard key={asset.id} asset={asset} />
      ))}
    </div>
  );
}
