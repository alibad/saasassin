import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { ProductSite } from "@/lib/brand/types";
import { cn } from "@/lib/utils";

import { Section, SectionHeading, type SiteLook } from "./primitives";

/** Frequently asked questions. `split` puts the heading beside the list; `stacked` above it. */
export function Faq({
  faq,
  look,
  variant = "split",
  tone,
  id = "faq",
}: {
  faq: ProductSite["faq"];
  look: SiteLook;
  variant?: "split" | "stacked";
  tone?: "default" | "subtle" | "ink" | "card";
  id?: string;
}) {
  const list = (
    <Accordion type="single" collapsible className="w-full border-t border-border">
      {faq.items.map((item, index) => (
        <AccordionItem key={item.q} value={`faq-${index}`} className="border-border">
          <AccordionTrigger className="py-5 text-base font-semibold hover:no-underline sm:text-[1.05rem]">{item.q}</AccordionTrigger>
          <AccordionContent className="pr-8 text-[0.98rem] leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );

  if (variant === "stacked") {
    return (
      <Section id={id} tone={tone}>
        <SectionHeading look={look} kicker={faq.kicker} title={faq.title} />
        <div className={cn("mt-12 max-w-3xl", look.align === "center" && "mx-auto")}>{list}</div>
      </Section>
    );
  }

  return (
    <Section id={id} tone={tone}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
        <SectionHeading look={look} kicker={faq.kicker} title={faq.title} align="left" />
        {list}
      </div>
    </Section>
  );
}
