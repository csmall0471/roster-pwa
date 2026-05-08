"use client";

import { useState } from "react";
import Image from "next/image";

export default function TeamPhotoBanner({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative w-full aspect-[3/1] rounded-2xl overflow-hidden mb-5 bg-gray-100 dark:bg-gray-800 block cursor-zoom-in"
        aria-label="View full team photo"
      >
        <Image src={src} alt={alt} fill className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(false)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ×
          </button>
          <div className="relative max-w-5xl w-full max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={src}
              alt={alt}
              width={1600}
              height={1067}
              className="w-full h-auto max-h-[90vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
