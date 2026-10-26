"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger {...props} />;
}

function DropdownMenuContent({ className, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Portal>
      {/* The z-index belongs on the positioner (the positioned wrapper), or sticky table headers draw over the menu. */}
      <MenuPrimitive.Positioner sideOffset={6} align="end" className="z-[100]">
        <MenuPrimitive.Popup
          className={cn(
            "z-50 min-w-32 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-lg outline-none",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      className={cn(
        "flex cursor-default items-center rounded-md px-2.5 py-2 outline-none data-highlighted:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuIconTrigger({ label = "Open actions" }: { label?: string }) {
  return (
    <DropdownMenuTrigger
      render={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        />
      }
    >
      <MoreHorizontal className="size-4" />
    </DropdownMenuTrigger>
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconTrigger,
  DropdownMenuItem,
  DropdownMenuTrigger,
};