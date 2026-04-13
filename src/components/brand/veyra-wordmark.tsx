import Image from "next/image";

type VeyraWordmarkProps = {
  iconClassName?: string;
  iconImageClassName?: string;
  textClassName?: string;
};

export function VeyraWordmark({
  iconClassName = "size-10",
  iconImageClassName,
  textClassName = "text-2xl font-semibold tracking-tight text-[#10292B] dark:text-foreground",
}: VeyraWordmarkProps) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/veyra.svg"
        alt="veyra"
        width={40}
        height={40}
        className={[iconClassName, iconImageClassName].filter(Boolean).join(" ")}
        priority
      />
      <span className={textClassName}>veyra</span>
    </div>
  );
}
