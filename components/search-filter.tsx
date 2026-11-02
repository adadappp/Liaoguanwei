"use client";
import { useId, type ComponentType } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Props = {
  label: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  value: string;
  options: { value: string; label: string }[];
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
};

export function SearchFilter({ label, icon: Icon, value, options, open, disabled, onOpenChange, onChange }: Props) {
  const valueId = useId();
  return <div className="search-filter" data-disabled={disabled || undefined}>
    <Icon size={15} aria-hidden={true} />
    <span className="search-filter-value" id={valueId}>{options.find(option => option.value === value)?.label || options[0].label}</span>
    <DropdownMenu open={open && !disabled} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="filter-arrow" disabled={disabled} aria-label={`${open ? "收起" : "展开"}${label}选项`} aria-describedby={valueId}><ChevronDown size={12} aria-hidden="true" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="search-filter-menu" align="start" side="bottom" sideOffset={8} collisionPadding={16} aria-label={`${label}选项`}>
        <DropdownMenuLabel className="search-filter-menu-label">{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map(option => <DropdownMenuRadioItem className="search-filter-option" key={option.value} value={option.value}>{option.label}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
