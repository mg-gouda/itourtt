import { PageHeaderSkeleton, FormSkeleton } from "@/components/ui/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton hasButton={true} />
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <Skeleton className="h-5 w-32" />
          <FormSkeleton fields={6} />
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <FormSkeleton fields={3} />
        </div>
      </div>
    </div>
  );
}
