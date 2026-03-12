import { motion } from "framer-motion";

import type { Asset } from "@/data/mock";
import { TokenCard } from "@/components/portfolio/TokenCard";

type AssetListProps = {
  assets: Asset[];
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

export function AssetList({ assets }: AssetListProps) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      layout
    >
      {assets.map((asset) => (
        <motion.div key={asset.id} variants={itemVariants} layout>
          <TokenCard asset={asset} />
        </motion.div>
      ))}
    </motion.div>
  );
}
