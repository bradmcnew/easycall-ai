import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface IspCardProps {
  isp: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string;
  };
  className?: string;
}

export function IspCard({ isp, className }: IspCardProps) {
  return (
    <Link href={`/select-issue?isp=${isp.slug}`} className="group outline-none">
      <Card
        className={cn(
          "flex items-center justify-center p-6 transition-all",
          "hover:border-primary/40 hover:shadow-md",
          "group-focus-visible:border-ring group-focus-visible:ring-2 group-focus-visible:ring-ring/50",
          className
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-12 w-32">
            <Image
              src={isp.logoUrl}
              alt={`${isp.name} logo`}
              fill
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-foreground">{isp.name}</span>
        </div>
      </Card>
    </Link>
  );
}
