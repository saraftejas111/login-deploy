import { useEffect, useState } from "react";

const EnlargeableImage = ({ src, alt = "", className = "", imageClassName = "" }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (!src) return null;
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`Enlarge ${alt || "image"}`} className={`cursor-zoom-in ${className}`}>
      <img src={src} alt={alt} className={imageClassName} />
    </button>
    {open && <div role="dialog" aria-modal="true" aria-label={alt || "Enlarged image"} onClick={() => setOpen(false)} className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/85 p-4">
      <button type="button" onClick={() => setOpen(false)} aria-label="Close enlarged image" className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-2 text-2xl leading-none text-white hover:bg-white/25">×</button>
      <img src={src} alt={alt} onClick={(event) => event.stopPropagation()} className="max-h-[92vh] max-w-[94vw] cursor-default rounded-lg object-contain shadow-2xl" />
    </div>}
  </>;
};

export default EnlargeableImage;
