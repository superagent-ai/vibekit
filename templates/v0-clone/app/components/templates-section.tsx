"use client";

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { templates } from "@/config";

function TemplateCard({
  template,
  onSelect,
}: {
  template: (typeof templates)[0];
  onSelect: (id: string) => void;
}) {
  const handleTemplateSelect = async () => {
    onSelect(template.id);
  };

  return (
    <div
      className="min-w-[276px] h-40 bg-background rounded-lg border p-4 flex flex-col gap-3 hover:bg-muted/50 transition-colors cursor-pointer group snap-start"
      onClick={handleTemplateSelect}
    >
      <div className="flex items-start justify-between">
        <div className="*:data-[slot=avatar]:ring-background flex -space-x-2 *:data-[slot=avatar]:ring-2">
          {template.logos.map((logo) => (
            <Avatar key={logo} className="w-6 h-6 bg-background">
              <AvatarImage src={logo} alt={logo} />
            </Avatar>
          ))}
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="flex-1">
        <h3 className="font-medium text-sm mb-2">{template.name}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {template.description}
        </p>
      </div>
    </div>
  );
}

export default function TemplatesSection({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const scrollAmount = Math.min(container.clientWidth * 0.75, 400);
      container.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      const container = scrollRef.current;
      const scrollAmount = Math.min(container.clientWidth * 0.75, 400);
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="flex flex-col gap-y-4 max-w-6xl w-full mx-auto md:px-0 px-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">Templates</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={scrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={scrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-hidden overflow-x-auto scrollbar-hide pb-2 scroll-smooth snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
