import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  /** Render priority. Use "high" only for above-the-fold / LCP images. */
  priority?: boolean;
  /** Wrapper class (controls aspect/size). The img always fills it. */
  wrapperClassName?: string;
};

/**
 * Image with lazy-loading, async decoding and a subtle shimmer placeholder
 * that fades out once the image is decoded. Avoids layout shift by relying
 * on the wrapper's box.
 */
export function SmartImage({
  src,
  alt = "",
  className,
  wrapperClassName,
  priority = false,
  onLoad,
  onError,
  ...rest
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn("relative w-full h-full overflow-hidden", wrapperClassName)}>
      {!loaded && !failed && (
        <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
      )}
      {!failed && src && (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          // @ts-expect-error fetchpriority is a valid HTML attr not yet typed everywhere
          fetchpriority={priority ? "high" : "auto"}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.(e);
          }}
          onError={(e) => {
            setFailed(true);
            onError?.(e);
          }}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
            className,
          )}
          {...rest}
        />
      )}
    </div>
  );
}
