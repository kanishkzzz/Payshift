import Image from "next/image";

export default function TrackyBrandIcon({ className = "h-8 w-8" }: { className?: string }) {
  return <Image src="/icon.png" alt="" aria-hidden width={512} height={512} className={`shrink-0 rounded-[22%] object-cover ${className}`} />;
}
