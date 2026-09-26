import Image from "next/image";

/** The canonical PARADA logo, unmodified, mounted on its own light plate —
 *  the source asset is black ink on a transparent field and would disappear
 *  directly on the dark nav/ground. The plate is a fixed neutral white by
 *  design (intentionally theme-independent): the mark needs the same legible
 *  ground in both registers, not a themed surface colour. One component for
 *  the shell and the login page (there used to be three copies). */
export function BrandLogo({ height = 15, priority = false }: { height?: number; priority?: boolean }) {
  const width = Math.round(height * (1500 / 198));
  return (
    <div className="inline-flex shrink-0 items-center rounded-lg rounded-tr-panel-cut border border-line bg-white px-2 py-1.5">
      <Image src="/brand/parada-logo.webp" alt="PARADA" width={width} height={height} priority={priority} />
    </div>
  );
}
