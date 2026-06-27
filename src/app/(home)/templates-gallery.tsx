"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

import { createDocument } from "@/lib/actions";
import { templates } from "@/constants/templates";

export const TemplatesGallery = () => {
  const router = useRouter();

  const handleCreate = async (title: string, initialContent: string) => {
    try {
      const id = await createDocument({ title, initialContent });
      toast.success("Document created");
      router.push(`/documents/${id}`);
    } catch {
      toast.error("Failed to create document");
    }
  };

  return (
    <div className="bg-[#F1F3F4]">
      <div className="max-w-screen-xl mx-auto px-16 py-6 flex flex-col gap-y-4">
        <h3 className="font-medium">Start a new document</h3>
        <Carousel>
          <CarouselContent className="-ml-4">
            {templates.map((template) => (
              <CarouselItem
                key={template.id}
                className="basis-1/2 sm:basis-1/3 md:basis-1/4 lg:basis-1/5 xl:basis-1/6 2xl:basis-[14.285714%] pl-4"
              >
                <div
                  className={`aspect-[3/4] flex flex-col gap-y-2.5`}
                >
                  <button
                    onClick={() =>
                      handleCreate(
                        template.label,
                        template.initialContent
                      )
                    }
                    style={{
                      backgroundImage: template.imageUrl
                        ? `url(${template.imageUrl})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                    className="size-full hover:border-blue-500 rounded-sm border hover:bg-blue-50 transition flex flex-col items-center justify-center gap-y-4 bg-white"
                  >
                    {!template.imageUrl && (
                      <span className="text-sm text-muted-foreground">
                        {template.label === "Blank Document" ? "+" : template.label}
                      </span>
                    )}
                  </button>
                  <p className="text-sm font-medium truncate">
                    {template.label}
                  </p>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    </div>
  );
};
