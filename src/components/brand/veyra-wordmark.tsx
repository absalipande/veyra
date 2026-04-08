import Image from "next/image";

type VeyraWordmarkProps = {
  iconClassName?: string;
  textClassName?: string;
};

export function VeyraWordmark({
  iconClassName = "size-10",
  textClassName = "text-2xl font-semibold tracking-tight text-[#10292B]",
}: VeyraWordmarkProps) {
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/veyra.svg"
        alt="veyra"
        width={40}
        height={40}
        className={iconClassName}
        priority
      />
      <span className={textClassName}>veyra</span>
    </div>
  );
}
