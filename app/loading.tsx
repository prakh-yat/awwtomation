import { BrandLoader } from "@/components/layout/brand-loader";

export default function Loading() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center">
      <BrandLoader />
    </div>
  );
}
